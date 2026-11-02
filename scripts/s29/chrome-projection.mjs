import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import {
  mkdtemp,
  cp,
  readFile,
  writeFile,
  mkdir,
  rm,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import { install } from "../s28/install.mjs";
import { reservePort, waitFor, evaluate, cdp } from "../chrome-cdp-utils.mjs";
const bin = process.env.CHROME_FOR_TESTING_BIN;
if (!bin) throw Error("CHROME_FOR_TESTING_BIN required");
const server = createServer((_req, res) => {
  res.setHeader("content-type", "text/html");
  res.end(
    '<!doctype html><title>Projection fixture</title><body><button>Save</button><input value="NEVER_STORE_INPUT"><div data-private>NEVER_STORE_PRIVATE</div></body>',
  );
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const root = await mkdtemp(`${tmpdir()}/s29-projection-`),
  profile = `${root}/chrome`,
  extension = `${root}/extension`;
await cp("dist/s28/chrome-extension", extension, { recursive: true });
const manifest = JSON.parse(
  await readFile(`${extension}/manifest.json`, "utf8"),
);
manifest.host_permissions = [`${origin}/*`];
manifest.content_scripts[0].matches = [`${origin}/*`];
await writeFile(`${extension}/manifest.json`, JSON.stringify(manifest));
const port = await reservePort();
const chrome = spawn(
  bin,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    `--load-extension=${extension}`,
    `--disable-extensions-except=${extension}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
const closed = new Promise((r) => chrome.once("close", r));
const timer = setTimeout(() => chrome.kill("SIGKILL"), 45000);
let daemon;
try {
  const targets = () =>
    fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const worker = await waitFor(
    async () => {
      try {
        return (await targets()).find(
          (t) =>
            t.type === "service_worker" &&
            t.url.endsWith("/js/service-worker.js"),
        );
      } catch {
        return undefined;
      }
    },
    10000,
    "WORKER",
  );
  const extensionId = new URL(worker.url).host;
  const prepared = await install({
    directory: `${root}/agent`,
    extensionId,
    executable: process.execPath,
    dryRun: false,
  });
  const config = JSON.parse(await readFile(prepared.configPath, "utf8"));
  await mkdir(`${profile}/NativeMessagingHosts`, {
    recursive: true,
    mode: 0o700,
  });
  await cp(
    `${root}/agent/host-registration.json`,
    `${profile}/NativeMessagingHosts/ai.contextpilot.agent.json`,
  );
  await build({
    entryPoints: ["extension/tests/fixture/s29/projection-daemon.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: `${root}/daemon.mjs`,
  });
  const daemonReport = `${root}/daemon.json`;
  daemon = spawn(
    process.execPath,
    [`${root}/daemon.mjs`, prepared.configPath, daemonReport],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  await waitFor(
    () =>
      access(config.socketPath)
        .then(() => true)
        .catch(() => false),
    5000,
    "DAEMON",
  );
  const tabId = await evaluate(
    worker,
    `chrome.tabs.create({url:${JSON.stringify(origin + "/page")},active:true}).then(t=>t.id)`,
  );
  const page = await waitFor(
    async () => (await targets()).find((t) => t.url === origin + "/page"),
    5000,
    "PAGE",
  );
  await waitFor(
    () => evaluate(page, "document.readyState==='complete'"),
    5000,
    "PAGE_READY",
  );
  const bundle = await build({
    entryPoints: ["extension/tests/fixture/s29/projection-worker.ts"],
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "ProjectionFixture",
    write: false,
  });
  await evaluate(worker, bundle.outputFiles[0].text);
  const collection = await evaluate(
    worker,
    `ProjectionFixture.publish(${tabId},${JSON.stringify({ installationId: config.installationId, profileId: config.profileId, extensionId, secret: config.secret })})`,
  );
  const readReport = () =>
    readFile(daemonReport, "utf8")
      .then(JSON.parse)
      .catch(() => undefined);
  const reads = await waitFor(
    async () => {
      const r = await readReport();
      if (r?.state === "FAIL") throw Error(r.error);
      return r?.state === "READS_PASS" && r;
    },
    8000,
    "PROJECTION_READS",
  );
  assert.ok(reads.privateExcluded && reads.bytes > 256 * 1024);
  await cdp(page.webSocketDebuggerUrl, "Page.navigate", {
    url: origin + "/new",
  });
  await waitFor(
    async () =>
      (await evaluate(worker, "ProjectionFixture.current()")) === false,
    3000,
    "SOURCE_INVALIDATED",
  );
  await writeFile(daemonReport + ".navigate", "true");
  const result = await waitFor(
    async () => {
      const r = await readReport();
      if (r?.state === "FAIL") throw Error(r.error);
      return r?.state === "PASS" && r;
    },
    5000,
    "STALE_DENIAL",
  );
  const browser = await fetch(`http://127.0.0.1:${port}/json/version`).then(
    (r) => r.json(),
  );
  const report = {
    result: "PASS",
    browser: browser.Browser,
    scope:
      "source-fixture Worker composition; real Chrome content collection/IndexedDB/native host/Unix socket and authenticated backend read; synthetic read admission and Unicode dataset; no task/provider routing",
    collection,
    native: result,
  };
  const output =
    process.env.S29_PROJECTION_EVIDENCE_DIR ?? "/tmp/s29-projection-evidence";
  await mkdir(output, { recursive: true });
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  clearTimeout(timer);
  daemon?.kill("SIGTERM");
  chrome.kill("SIGTERM");
  await closed;
  await new Promise((r) => server.close(r));
  await rm(root, {
    recursive: true,
    force: true,
  });
}
