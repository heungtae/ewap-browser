import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import { reservePort, waitFor, cdp, evaluate } from "../chrome-cdp-utils.mjs";
const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable) throw new Error("CHROME_FOR_TESTING_BIN required");
const fixture = createServer((req, res) => {
  if (req.url.startsWith("/data")) {
    res.setHeader("content-type", "application/json");
    res.setHeader("set-cookie", "secret=PRIVATE_COOKIE");
    res.end(
      JSON.stringify([{ label: "safe", value: 3, token: "PRIVATE_TOKEN" }]),
    );
    return;
  }
  res.setHeader("content-type", "text/html");
  res.end(
    `<!doctype html><html><head><title>S32 fixture</title></head><body><button>AX action</button><input type="password" value="AX_PRIVATE"></body></html>`,
  );
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const address = fixture.address();
assert.ok(address && typeof address !== "string");
const profile = await mkdtemp(`${tmpdir()}/s32-chrome-`);
const port = await reservePort();
const child = spawn(
  executable,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    `http://127.0.0.1:${address.port}/`,
  ],
  { stdio: "ignore" },
);
const closed = new Promise((r) => child.once("close", r));
const deadline = setTimeout(() => child.kill("SIGKILL"), 50000);
try {
  const target = await waitFor(
    async () => {
      try {
        return (
          await fetch(`http://127.0.0.1:${port}/json/list`).then((r) =>
            r.json(),
          )
        ).find(
          (t) => t.type === "page" && t.url.startsWith("http://127.0.0.1"),
        );
      } catch {
        return undefined;
      }
    },
    10000,
    "CHROME_READY",
  );
  const { RemoteTransport } = await import("./remote-transport.mjs");
  const { BoundedCdpBroker, CollectorConsent } = await import(
    "../../dist/s32/broker.mjs"
  );
  const {
    accessibilityRows,
    networkMetadata,
    responseRows,
    CollectorBudget,
    transientVisual,
  } = await import("../../dist/s32/collector.mjs");
  const { setup } = await import("../../dist/s32/setup.mjs");
  const f = await setup();
  const transport = new RemoteTransport(target.webSocketDebuggerUrl);
  const marks = new Map();
  const ownership = {
    async available(tab) {
      return !marks.has(tab);
    },
    async mark(tab, owner) {
      marks.set(tab, owner);
    },
    async clear(tab, owner) {
      assert.equal(marks.get(tab), owner);
      marks.delete(tab);
    },
  };
  const broker = new BoundedCdpBroker({
    transport,
    ownership,
    current: () => f.context,
    allowed: (cap) => cap !== "input",
  });
  const signal = new AbortController().signal;
  const ax = accessibilityRows(await broker.ax(f.context, signal));
  assert.ok(ax.rows.length > 0);
  const origin = `http://127.0.0.1:${address.port}`;
  const consent = new CollectorConsent(f.ui, () => f.context);
  const bodyScope = "a".repeat(64);
  consent.grant(f.principal, "network_body", bodyScope);
  const network = await broker.network(
    f.context,
    signal,
    origin,
    async (access) => {
      await evaluate(
        target,
        "fetch('/data?token=PRIVATE_QUERY').then(r=>r.json()).then(()=>true)",
      );
      await waitFor(
        () => access.snapshot().some((row) => row.finished),
        5000,
        "NETWORK_FINISHED",
      );
      const raw = access.snapshot()[0];
      assert.ok(raw);
      const rows = responseRows(
        await access.body(raw.requestId, () =>
          consent.check("network_body", bodyScope),
        ),
        ["label", "value"],
      );
      const metadata = await networkMetadata(raw, origin);
      return { rows, metadata, coverage: access.coverage() };
    },
  );
  assert.deepEqual(network.rows, [["safe", 3]]);
  assert.doesNotMatch(
    JSON.stringify(network),
    /PRIVATE_QUERY|PRIVATE_TOKEN|PRIVATE_COOKIE/,
  );
  assert.equal(transport.attachments, 2);
  assert.equal(transport.detachments, 2);
  assert.equal(marks.size, 0);
  consent.grant(f.principal, "visual", "b".repeat(64));
  const visualBudget = new CollectorBudget({
    deadline: Date.now() + 10000,
    now: Date.now,
    current: () => true,
    signal,
  });
  let disposed = 0,
    interpreted = 0;
  await assert.rejects(
    transientVisual(
      {
        consent: () => consent.check("visual", "b".repeat(64)),
        async capture(s) {
          const image = await broker.capture(f.context, s, () =>
            consent.check("visual", "b".repeat(64)),
          );
          return {
            data: Uint8Array.from(Buffer.from(image.data, "base64")),
            dispose() {
              disposed++;
            },
          };
        },
        async mask() {
          return null;
        },
        async interpret() {
          interpreted++;
          return "unreachable";
        },
      },
      signal,
      visualBudget,
    ),
    /SCREENSHOT_UNMASKABLE/,
  );
  assert.equal(disposed, 1);
  assert.equal(interpreted, 0);
  assert.equal(transport.attachments, 3);
  assert.equal(transport.detachments, 3);
  const networkRows = [
    [
      network.metadata.endpoint,
      network.metadata.method,
      network.metadata.status,
      network.metadata.mime,
    ],
  ];
  const bundle = await build({
    entryPoints: ["extension/tests/fixture/s32/chrome-cases.ts"],
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "S32",
    write: false,
  });
  await evaluate(target, bundle.outputFiles[0].text);
  const report = await evaluate(
    target,
    `S32.runCases(${JSON.stringify(networkRows)}).then(result=>({result:'PASS',...result})).catch(error=>({result:'FAIL',error:error.stack}))`,
  );
  report.cdp = {
    axRows: ax.rows.length,
    visual: {
      captures: 1,
      disposed,
      interpreted,
      unmaskableRejected: true,
      pixelsPersisted: false,
    },
    ownedAttach: transport.attachments,
    ownedDetach: transport.detachments,
    commands: transport.commands,
    network,
    scope:
      "Owned remote CDP socket, not installed Chrome debugger permission/ownership qualification",
  };
  const output = "docs/evidence/s32-chrome-2026-10-20";
  await mkdir(output, { recursive: true });
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  assert.equal(report.result, "PASS", report.error);
  const browser = await fetch(`http://127.0.0.1:${port}/json/version`).then(
    (r) => r.json(),
  );
  console.log(JSON.stringify({ browser: browser.Browser, ...report }));
  const screenshot = await cdp(
    target.webSocketDebuggerUrl,
    "Page.captureScreenshot",
    { format: "png", captureBeyondViewport: true },
  );
  await writeFile(
    `${output}/recovery.png`,
    Buffer.from(screenshot.data, "base64"),
  );
  await writeFile(
    `${output}/environment.json`,
    JSON.stringify(browser, null, 2) + "\n",
  );
  await cdp(target.webSocketDebuggerUrl, "Page.stopLoading");
} finally {
  clearTimeout(deadline);
  child.kill("SIGTERM");
  await closed;
  await new Promise((r) => fixture.close(r));
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
