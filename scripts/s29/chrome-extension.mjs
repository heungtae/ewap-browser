import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, cp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { build } from "esbuild";
import { reservePort, waitFor, cdp, evaluate } from "../chrome-cdp-utils.mjs";
const bin = process.env.CHROME_FOR_TESTING_BIN;
if (!bin) throw Error("CHROME_FOR_TESTING_BIN required");
const fixture = createServer((_req, res) => {
  res.setHeader("content-type", "text/html");
  res.end(
    '<!doctype html><title>S29 extension fixture</title><body><form aria-label="Search"><input aria-label="Query" value="NEVER_STORE_INPUT"><button id="save">Save</button></form><table aria-label="Amounts"><tr><th>Amount</th></tr><tr><td>12</td></tr><tr><td>8</td></tr></table><div data-private>NEVER_STORE_PRIVATE</div></body>',
  );
});
await new Promise((r) => fixture.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${fixture.address().port}`;
const profile = await mkdtemp(`${tmpdir()}/s29-extension-`);
const extension = `${profile}/extension`;
await cp("dist/s28/chrome-extension", extension, { recursive: true });
const manifest = JSON.parse(
  await readFile(`${extension}/manifest.json`, "utf8"),
);
manifest.host_permissions = [`${origin}/*`];
manifest.content_scripts[0].matches = [`${origin}/*`];
await writeFile(`${extension}/manifest.json`, JSON.stringify(manifest));
const port = await reservePort();
const child = spawn(
  bin,
  [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--user-data-dir=${profile}/chrome`,
    `--remote-debugging-port=${port}`,
    `--load-extension=${extension}`,
    `--disable-extensions-except=${extension}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
const closed = new Promise((r) => child.once("close", r));
const timer = setTimeout(() => child.kill("SIGKILL"), 50000);
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
    "EXTENSION_WORKER",
  );
  await waitFor(
    () => evaluate(worker, "typeof chrome?.tabs?.create === 'function'"),
    10000,
    "WORKER_API_READY",
  );
  const created = await cdp(worker.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: `chrome.tabs.create({url:${JSON.stringify(origin + "/page")},active:true}).then(t=>t.id)`,
    awaitPromise: true,
    returnByValue: true,
  });
  assert.ok(
    !created.exceptionDetails,
    JSON.stringify(created.exceptionDetails),
  );
  const tabId = created.result?.value;
  assert.ok(Number.isInteger(tabId), JSON.stringify(created));
  const page = await waitFor(
    async () => (await targets()).find((t) => t.url === origin + "/page"),
    5000,
    "FIXTURE_TAB",
  );
  await waitFor(
    () => evaluate(page, "document.readyState==='complete'"),
    5000,
    "FIXTURE_READY",
  );
  const bundle = await build({
    entryPoints: ["extension/tests/fixture/s29/extension-worker.ts"],
    bundle: true,
    platform: "browser",
    format: "iife",
    globalName: "S29Extension",
    write: false,
  });
  await evaluate(worker, bundle.outputFiles[0].text);
  const call = async (expression) => {
    const response = await cdp(
      worker.webSocketDebuggerUrl,
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
    );
    assert.ok(
      !response.exceptionDetails,
      JSON.stringify(response.exceptionDetails),
    );
    return response.result?.value;
  };
  await call(`S29Extension.setup(${tabId})`);
  const first = await call("S29Extension.runRevision(1)");
  assert.ok(first.saveMatches >= 1);
  const revisit = await call("S29Extension.runRevision(2)");
  assert.equal(revisit.identityReused, true);
  await evaluate(page, "document.querySelector('#save').remove();true");
  const delta = await call("S29Extension.runRevision(3)");
  assert.equal(delta.saveMatches, 0);
  const request = await call("S29Extension.requestForNegative()");
  const id = new URL(worker.url).host;
  await evaluate(
    worker,
    `chrome.tabs.create({url:chrome.runtime.getURL('settings/index.html'),active:false}).then(()=>true)`,
  );
  const settings = await waitFor(
    async () =>
      (await targets()).find(
        (t) => t.url === `chrome-extension://${id}/settings/index.html`,
      ),
    5000,
    "SETTINGS_TAB",
  );
  const denied = await evaluate(
    settings,
    `chrome.tabs.sendMessage(${tabId},${JSON.stringify(request)}).catch(()=>({ok:false,code:'TRANSPORT'}))`,
  );
  assert.deepEqual(denied, { ok: false, code: "COLLECTOR_DENIED" });
  await cdp(page.webSocketDebuggerUrl, "Page.navigate", {
    url: origin + "/new-document",
  });
  await waitFor(
    async () => {
      const value = await evaluate(
        worker,
        `chrome.webNavigation.getFrame({tabId:${tabId},frameId:0}).then(f=>f?.url)`,
      );
      return value === origin + "/new-document";
    },
    5000,
    "NEW_DOCUMENT",
  );
  const stale = await call("S29Extension.rejectOldDocument()");
  const browser = await fetch(`http://127.0.0.1:${port}/json/version`).then(
    (r) => r.json(),
  );
  const report = {
    result: "PASS",
    browser: browser.Browser,
    scope:
      "isolated extension Worker to content-script transport and extension-origin IndexedDB; synthetic admission, no public task or provider routing",
    first,
    revisit,
    delta,
    stale,
    settingsImpersonationDenied: true,
    missingReadConsentDenied: true,
  };
  const output = process.env.S29_EVIDENCE_DIR ?? "/tmp/s29-extension-evidence";
  await mkdir(output, { recursive: true });
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  clearTimeout(timer);
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
