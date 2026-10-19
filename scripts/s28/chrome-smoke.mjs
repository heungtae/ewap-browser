import { qualifyNative } from "./chrome-native.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { build } from "esbuild";
import { reservePort, waitFor, cdp, evaluate } from "../chrome-cdp-utils.mjs";
const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable) throw new Error("CHROME_FOR_TESTING_BIN required");
const profile = await mkdtemp(`${tmpdir()}/s28-chrome-`);
const port = await reservePort();
const output = "docs/evidence/s28-ui-2026-10-19";
await mkdir(output, { recursive: true });
const child = spawn(
  executable,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    `--load-extension=${resolve("dist/s28/chrome-extension")}`,
    `--disable-extensions-except=${resolve("dist/s28/chrome-extension")}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
const deadline = setTimeout(() => child.kill("SIGKILL"), 50000);
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
    15000,
    "WORKER_READY",
  );
  const id = new URL(worker.url).host;
  const records = [];
  let native;
  for (const [name, path] of [
    ["panel", "sidepanel/index.html"],
    ["settings", "settings/index.html"],
    ["profiles", "settings/learned-profiles.html"],
  ]) {
    const version = await fetch(`http://127.0.0.1:${port}/json/version`).then(
      (r) => r.json(),
    );
    const created = await cdp(
      version.webSocketDebuggerUrl,
      "Target.createTarget",
      { url: `chrome-extension://${id}/${path}` },
    );
    const target = await waitFor(
      async () => (await targets()).find((t) => t.id === created.targetId),
      5000,
      "PAGE_TARGET",
    );
    await waitFor(
      () =>
        evaluate(
          target,
          "document.readyState === 'complete' && !!document.querySelector('#status,#settings-status,#learned-profile-status')?.textContent",
        ),
      5000,
      "PAGE_READY",
    );
    await cdp(
      target.webSocketDebuggerUrl,
      "Emulation.setDeviceMetricsOverride",
      {
        width: name === "panel" ? 390 : 1440,
        height: name === "panel" ? 844 : 1100,
        deviceScaleFactor: 1,
        mobile: false,
      },
    );
    const structure = await evaluate(
      target,
      `(()=>({ids:[...document.querySelectorAll('[id]')].map(e=>e.id),focus:[...document.querySelectorAll('button,input,select,textarea,a[href]')].filter(e=>e.getClientRects().length).map(e=>e.id||e.tagName),status:document.querySelector('#status,#settings-status,#learned-profile-status')?.textContent}))()`,
    );
    assert.ok(structure.ids.length > 10);
    assert.match(structure.status, /Backend/);
    const source = await readFile(`apps/chrome-extension/ui/${path}`, "utf8");
    for (const match of source.matchAll(/\bid="([^"]+)"/g))
      assert.ok(structure.ids.includes(match[1]), `${name}:${match[1]}`);
    if (name === "settings") {
      await evaluate(target, "location.hash='agent'");
      await waitFor(
        () =>
          evaluate(target, "document.activeElement?.id==='settings-content'"),
        2000,
        "SETTINGS_FOCUS",
      );
    }
    if (name === "panel") {
      const fixture = await build({
        stdin: {
          contents: `import { createView } from './apps/chrome-extension/src/presentation/view.ts'; import { mountPresentation } from './apps/chrome-extension/src/presentation/controller.ts'; mountPresentation(document, createView(document), {resume:async()=>({events:[{sequence:1,revision:1,kind:'message',text:'S28 fixture result'}],cursor:1,resync:false})}, {read:async()=>({controllerReady:false,analystReady:false,secretMode:'session-only'})});`,
          resolveDir: process.cwd(),
        },
        bundle: true,
        write: false,
        format: "iife",
      });
      await evaluate(target, fixture.outputFiles[0].text);
      assert.equal(
        await evaluate(
          target,
          "document.querySelector('#chat-messages .message[data-role=assistant]')?.textContent",
        ),
        "S28 fixture result",
      );
    }
    const screenshot = await cdp(
      target.webSocketDebuggerUrl,
      "Page.captureScreenshot",
      { format: "png" },
    );
    await writeFile(
      `${output}/${name}.png`,
      Buffer.from(screenshot.data, "base64"),
    );
    await writeFile(
      `${output}/${name}.json`,
      JSON.stringify(structure, null, 2) + "\n",
    );
    if (name === "panel" && process.argv.includes("--native"))
      native = await qualifyNative({
        profile,
        extensionId: id,
        worker,
        panel: target,
      });
    records.push({
      name,
      ids: structure.ids.length,
      focusable: structure.focus.length,
      status: structure.status,
    });
  }
  const browser = await fetch(`http://127.0.0.1:${port}/json/version`).then(
    (r) => r.json(),
  );
  const report = {
    native: native ?? "not requested",
    result: "PASS",
    scope:
      "target missing-backend, preserved static IDs, settings hash/focus, fixture message; not full S26 interaction parity",
    browser: browser.Browser,
    records,
  };
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  clearTimeout(deadline);
  const closed = new Promise((r) => child.once("close", r));
  child.kill("SIGTERM");
  await closed;
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
