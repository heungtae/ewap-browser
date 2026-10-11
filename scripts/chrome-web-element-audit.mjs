import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { cdp, evaluate, reservePort, waitFor } from "./chrome-cdp-utils.mjs";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import { runElementAuditChecks } from "./chrome-web-element-audit-checks.mjs";

// Internal Worker -> Content audit. It does not exercise approvals or a Provider.
// Assertions capture current defects, so PASS means reproduced, never fixed.
const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable) throw Error("CHROME_FOR_TESTING_BIN is required");
const temporary = await mkdtemp(join(tmpdir(), "contextpilot-element-audit-"));
const html = `<!doctype html><style>body{margin:10px}input,button,select{margin:3px} [contenteditable]{height:24px}</style>
<input type=checkbox aria-label="Native checkbox">
<button type=button role=radio aria-checked=false tabindex=-1 aria-label="Custom radio">500</button>
<button type=button role=checkbox aria-checked=false aria-label="Custom checkbox">Check</button>
<button type=button role=checkbox aria-checked=false aria-disabled=true aria-label="ARIA disabled">Disabled</button>
<fieldset disabled><input aria-label="Fieldset disabled"></fieldset>
<input readonly aria-label="Read only">
<div role=textbox contenteditable=true aria-label="Rich editor">Old</div>
<div contenteditable=true>Unlabelled editor</div>
<button type=button aria-pressed=false aria-label="Toggle button">Toggle</button>
<div role=switch aria-checked=false aria-label="Custom switch">Switch</div>
<div role=slider aria-valuenow=20 aria-valuemin=0 aria-valuemax=100 aria-label="Custom slider">Slider</div>
<input type=range aria-label="Native range"><input type=date aria-label="Native date">
<input type=file aria-label="Native file"><input type=button value="Input button" aria-label="Input button">
<input type=number aria-label="Native number">
<select multiple aria-label="Multi select"><option>One</option><option>Two</option></select>
<div role=listbox aria-label="Custom list"><div role=option aria-selected=false aria-label="List option">Option</div></div>
<input type=checkbox aria-label="Mixed checkbox">
<div id=shadow></div><iframe srcdoc='<button>Frame button</button>'></iframe>
<details><summary>Disclosure</summary>Details</details>
<a href=/next aria-label="Next link">Next</a>
<script>document.querySelector('#shadow').attachShadow({mode:'open'}).innerHTML='<button>Shadow button</button>';
document.querySelector('[aria-label="Mixed checkbox"]').indeterminate=true;
window.radioClicks=0;window.checkboxClicks=0;
document.querySelector('[role=radio]').onclick=(e)=>{window.radioClicks++;setTimeout(()=>e.target.setAttribute('aria-checked','true'),100);};
document.querySelector('[aria-label="Custom checkbox"]').onclick=(e)=>{window.checkboxClicks++;e.target.setAttribute('aria-checked','true');};</script>`;
let child;
let fixture;
try {
  fixture = await createS1Fixture(temporary, html);
  const port = await reservePort();
  child = spawn(
    executable,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--window-size=1440,1100",
      "--ignore-certificate-errors",
      "--host-resolver-rules=MAP s1.fixture.test 127.0.0.1",
      `--user-data-dir=${join(temporary, "profile")}`,
      `--load-extension=${resolve("dist-extension")}`,
      `--disable-extensions-except=${resolve("dist-extension")}`,
      `--remote-debugging-port=${port}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const version = await waitFor(
    () =>
      fetch(`http://127.0.0.1:${port}/json/version`)
        .then((r) => r.json())
        .catch(() => undefined),
    15000,
    "CHROME_READY",
  );
  const targets = () =>
    fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const worker = await waitFor(
    async () =>
      (await targets()).find(
        (t) =>
          t.type === "service_worker" &&
          t.url.endsWith("/js/service-worker.js"),
      ),
    15000,
    "WORKER_READY",
  );
  const url = `https://s1.fixture.test:${fixture.fixturePort}/`;
  const created = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    { url },
  );
  const page = await waitFor(
    async () => (await targets()).find((t) => t.id === created.targetId),
    10000,
    "PAGE_READY",
  );
  await waitFor(
    () => evaluate(page, "document.readyState === 'complete'"),
    10000,
    "PAGE_LOADED",
  );
  const loadedVersion = await waitFor(
    () => evaluate(worker, "chrome.runtime.getManifest().version"),
    10000,
    "WORKER_INITIALIZED",
  );
  assert.equal(
    loadedVersion,
    JSON.parse(await readFile("extension/manifest.json", "utf8")).version,
  );
  const tabId = await evaluate(
    worker,
    `(async()=> (await chrome.tabs.query({})).find(t=>t.url===${JSON.stringify(url)}).id)()`,
  );
  const send = (message) =>
    evaluate(
      worker,
      `chrome.tabs.sendMessage(${tabId},${JSON.stringify(message)})`,
    );
  const response = await waitFor(
    async () => {
      const value = await send({ kind: "CONTENT_SNAPSHOT", scope: "all_dom" });
      return value?.ok ? value : undefined;
    },
    10000,
    "CONTENT_READY",
  );
  const snapshot = response.snapshot.snapshot;
  const checks = await runElementAuditChecks({ snapshot, send, page, tabId });
  const paths = [
    "extension/src/content/entry.ts",
    "extension/src/service-worker/page-derived-actions.ts",
    "extension/src/service-worker/act-tools.ts",
    "dist-extension/js/content.js",
    "dist-extension/js/service-worker.js",
    "dist/service-worker/page-derived-actions.js",
    "dist/service-worker/act-tools.js",
    "scripts/chrome-web-element-audit.mjs",
    "scripts/chrome-web-element-audit-checks.mjs",
    "scripts/chrome-checked-control-regression.mjs",
    "extension/src/content/checked-control.ts",
  ];
  const hashes = {};
  for (const path of paths)
    hashes[path] = createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  const report = {
    recorded_at: new Date().toISOString(),
    extension_version: loadedVersion,
    chrome: version.Browser,
    scope:
      "controlled HTTPS internal Worker-Content plus compiled provider schemas; no approval or live Provider qualification",
    hashes,
    checks,
    total: checks.length,
  };
  if (process.env.WEB_ELEMENT_AUDIT_REPORT)
    await writeFile(
      process.env.WEB_ELEMENT_AUDIT_REPORT,
      JSON.stringify(report, null, 2) + "\n",
    );
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((resolveClose) => child.once("close", resolveClose));
  }
  if (fixture)
    await new Promise((resolveClose) => fixture.fixture.close(resolveClose));
  await rm(temporary, { recursive: true, force: true, maxRetries: 3 });
}
