import { qualifyPanelDownload } from "./chrome-panel-download.mjs";
import { qualifyPanelGuards } from "./chrome-panel-guards.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, cp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import { reservePort, waitFor, cdp, evaluate } from "../chrome-cdp-utils.mjs";
import { qualifyPanelCases } from "./chrome-panel-cases.mjs";
const executable = process.env.CHROME_FOR_TESTING_BIN;
assert.ok(executable, "CHROME_FOR_TESTING_BIN required");
const temporary = await mkdtemp(`${tmpdir()}/s28-panel-`);
const extension = `${temporary}/extension`;
let child, closed, timeout;
try {
  await cp("dist/s28/chrome-extension", extension, { recursive: true });
  const fixture = await build({
    entryPoints: ["extension/tests/fixture/s28/panel-client.ts"],
    bundle: true,
    format: "iife",
    platform: "browser",
    write: false,
    define: { __CONTEXTPILOT_DIAGNOSTICS_MODE__: '"release"' },
  });
  await writeFile(
    `${extension}/js/panel-fixture.js`,
    fixture.outputFiles[0].text,
  );
  const path = `${extension}/sidepanel/index.html`;
  const html = await readFile(path, "utf8");
  assert.equal(
    (html.match(/<script type="module"[^>]*><\/script>/g) ?? []).length,
    1,
  );
  await writeFile(
    path,
    html.replace(
      /<script type="module"[^>]*><\/script>/,
      '<script type="module" src="../js/panel-fixture.js"></script>',
    ),
  );
  const port = await reservePort();
  child = spawn(
    executable,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--user-data-dir=${temporary}/chrome`,
      `--remote-debugging-port=${port}`,
      `--load-extension=${extension}`,
      `--disable-extensions-except=${extension}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  closed = new Promise((r) => child.once("close", r));
  timeout = setTimeout(() => child.kill("SIGKILL"), 50000);
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
    "PANEL_FIXTURE_WORKER",
  );
  await waitFor(
    () => evaluate(worker, "typeof chrome.tabs?.create==='function'"),
    3000,
    "PANEL_WORKER_API",
  );
  const id = new URL(worker.url).host;
  await evaluate(
    worker,
    `chrome.tabs.create({url:'chrome-extension://${id}/sidepanel/index.html'}).then(t=>t.id)`,
  );
  const panel = await waitFor(
    async () =>
      (await targets()).find((t) => t.url.endsWith("/sidepanel/index.html")),
    5000,
    "PANEL_FIXTURE",
  );
  await waitFor(
    () =>
      evaluate(
        panel,
        "!!window.__s28PanelFixture && document.querySelector('#status').textContent.includes('Backend connected')",
      ),
    5000,
    "PANEL_FIXTURE_READY",
  );
  await cdp(panel.webSocketDebuggerUrl, "Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const output = process.env.S28_PANEL_EVIDENCE_DIR ?? `${temporary}/evidence`;
  await mkdir(output, { recursive: true });
  const results = await qualifyPanelCases(panel, output);
  const guards = await qualifyPanelGuards(panel);
  const browser = await fetch(`http://127.0.0.1:${port}/json/version`).then(
    (r) => r.json(),
  );
  const diagnosticsDownload = await qualifyPanelDownload(
    panel,
    browser,
    `${temporary}/downloads`,
  );
  const report = {
    ...results,
    guards,
    fixtureResponses: await evaluate(
      panel,
      "window.__s28PanelFixture.responses().length",
    ),
    diagnosticsDownload,
    browser: browser.Browser,
    approvals: 0,
    providerCalls: 0,
    businessDispatches: 0,
  };
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  clearTimeout(timeout);
  if (child) {
    child.kill("SIGTERM");
    await closed;
  }
  await rm(temporary, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
