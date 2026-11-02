import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, readFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { reservePort, waitFor, evaluate } from "../chrome-cdp-utils.mjs";
import { createMainFixture } from "./main-fixture.mjs";
import { qualifyMainHelpers } from "./chrome-main-cases.mjs";
const executable = process.env.CHROME_FOR_TESTING_BIN;
assert.ok(executable, "CHROME_FOR_TESTING_BIN required");
const temporary = await mkdtemp(`${tmpdir()}/s28-main-`);
let fixture, child, closed, timeout;
try {
  const prepared = await createMainFixture(temporary);
  fixture = prepared.fixture;
  const extension = `${temporary}/extension`;
  await cp("dist/s28/chrome-extension", extension, { recursive: true });
  // Static module imports mirror an MV3 Worker; dynamic import is unavailable there.
  await writeFile(
    `${extension}/js/main-fixture-worker.js`,
    'import * as h from "./main-helpers.js"; import "./service-worker.js"; import {injectMainFrame} from "./main-transport.js"; globalThis.__s28MainHelpers=h;globalThis.__s28InjectMain=injectMainFrame;\n',
  );
  const manifest = JSON.parse(
    await readFile(`${extension}/manifest.json`, "utf8"),
  );
  manifest.background.service_worker = "js/main-fixture-worker.js";
  await writeFile(`${extension}/manifest.json`, JSON.stringify(manifest));
  const port = await reservePort();
  child = spawn(
    executable,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--ignore-certificate-errors",
      "--no-proxy-server",
      `--host-resolver-rules=MAP page-api-fixture.invalid:443 127.0.0.1:${prepared.port}`,
      `--user-data-dir=${temporary}/chrome`,
      `--remote-debugging-port=${port}`,
      `--load-extension=${resolve(extension)}`,
      `--disable-extensions-except=${resolve(extension)}`,
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
            t.url.endsWith("/js/main-fixture-worker.js"),
        );
      } catch {
        return undefined;
      }
    },
    10000,
    "MAIN_WORKER",
  );
  await waitFor(
    () => evaluate(worker, "typeof chrome.tabs?.create==='function'"),
    3000,
    "MAIN_WORKER_API",
  );
  const tabId = await evaluate(
    worker,
    "chrome.tabs.create({url:'https://page-api-fixture.invalid/variant'}).then(t=>t.id)",
  );
  const page = await waitFor(
    async () =>
      (await targets()).find(
        (t) => t.url === "https://page-api-fixture.invalid/variant",
      ),
    5000,
    "MAIN_PAGE",
  );
  await waitFor(
    () =>
      evaluate(page, "document.readyState==='complete' && !!window.fixtureApp"),
    5000,
    "MAIN_FIXTURE_READY",
  );
  const frame = await evaluate(
    worker,
    `chrome.webNavigation.getFrame({tabId:${tabId},frameId:0})`,
  );
  assert.ok(frame);
  const cases = await qualifyMainHelpers(worker, page, tabId, frame);
  const version = await fetch(`http://127.0.0.1:${port}/json/version`).then(
    (r) => r.json(),
  );
  const report = {
    result: "PASS",
    browser: version.Browser,
    scope:
      "unchanged packaged helpers statically imported by fixture MV3 Worker and serialized into controlled HTTPS MAIN; not normal Worker policy/task routing",
    ...cases,
    approvals: 0,
    providerCalls: 0,
  };
  const output = process.env.S28_MAIN_EVIDENCE_DIR;
  if (output) {
    await mkdir(output, { recursive: true });
    await writeFile(
      `${output}/report.json`,
      JSON.stringify(report, null, 2) + "\n",
    );
  }
  console.log(JSON.stringify(report));
} finally {
  clearTimeout(timeout);
  if (child) {
    child.kill("SIGTERM");
    await closed;
  }
  if (fixture) await new Promise((r) => fixture.close(r));
  await rm(temporary, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
