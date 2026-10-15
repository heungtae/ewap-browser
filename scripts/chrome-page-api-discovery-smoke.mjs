/* global console, fetch, process, URL */
/** Regression for retirement of the manual Page API hint and collection entrypoints. */
import { spawn, execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:https";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { openAnalysisPanel } from "./chrome-analysis-panel.mjs";
import { cdp, evaluate, reservePort, waitFor } from "./chrome-cdp-utils.mjs";

const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable)
  throw new Error("CHROME_FOR_TESTING_BIN must point to Chrome for Testing");

const run = promisify(execFile);
const certificateDirectory = await mkdtemp(
  join(tmpdir(), "contextpilot-discovery-cert-"),
);
const profile = await mkdtemp(
  join(tmpdir(), "contextpilot-discovery-profile-"),
);
const fixtureRequests = [];
let fixture;
let child;
let chromeError = "";
try {
  await run("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(certificateDirectory, "key.pem"),
    "-out",
    join(certificateDirectory, "cert.pem"),
    "-days",
    "1",
    "-subj",
    "/CN=page-api-discovery.fixture.test",
  ]);
  const root = "examples/page-api-discovery-demo";
  const html = await readFile(`${root}/index.html`, "utf8");
  const external = await readFile(`${root}/external-fixture.js`, "utf8");
  fixture = createServer(
    {
      key: await readFile(join(certificateDirectory, "key.pem")),
      cert: await readFile(join(certificateDirectory, "cert.pem")),
    },
    (request, response) => {
      fixtureRequests.push(request.url);
      const body = request.url === "/external-fixture.js" ? external : html;
      response.writeHead(200, {
        "content-type":
          request.url === "/external-fixture.js"
            ? "text/javascript"
            : "text/html",
      });
      response.end(body);
    },
  );
  const fixturePort = await new Promise((resolvePort, reject) => {
    fixture.once("error", reject);
    fixture.listen(0, "127.0.0.1", () => {
      const address = fixture.address();
      if (!address || typeof address === "string") reject(new Error("no port"));
      else resolvePort(address.port);
    });
  });
  const cdpPort = await reservePort();
  child = spawn(
    executable,
    [
      "--disable-dev-shm-usage",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--no-sandbox",
      "--ozone-platform=x11",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-gpu",
      "--ignore-certificate-errors",
      "--host-resolver-rules=MAP page-api-discovery.fixture.test 127.0.0.1",
      `--user-data-dir=${profile}`,
      `--disable-extensions-except=${resolve("dist-extension")}`,
      `--load-extension=${resolve("dist-extension")}`,
      `--remote-debugging-port=${cdpPort}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  child.stderr.on("data", (chunk) => {
    chromeError = (chromeError + chunk.toString()).slice(-2000);
  });
  const version = await waitFor(
    () =>
      fetch(`http://127.0.0.1:${cdpPort}/json/version`)
        .then((r) => r.json())
        .catch(() => undefined),
    90_000,
    "Chrome for Testing did not open CDP",
  ).catch((error) => {
    throw new Error(error.message + chromeError);
  });
  const fixtureTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    {
      url: `https://page-api-discovery.fixture.test:${fixturePort}/`,
    },
  );
  const page = await waitFor(
    async () => {
      const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
        (r) => r.json(),
      );
      return targets.find((target) => target.id === fixtureTarget.targetId);
    },
    10000,
    "Discovery page target absent",
  );
  const worker = await waitFor(
    async () => {
      const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
        (r) => r.json(),
      );
      return targets.find(
        (target) =>
          target.type === "service_worker" &&
          target.url.endsWith("/js/service-worker.js"),
      );
    },
    10_000,
    "ContextPilot worker was not loaded",
  );
  const extensionId = new URL(worker.url).host;
  const { panel, panelWindowId } = await openAnalysisPanel({
    cdpPort,
    extensionId,
    fixtureTarget,
    version,
    worker,
  });
  const documentContext = await evaluate(
    worker,
    "chrome.tabs.query({}).then(async tabs => { const tab=tabs.find(item => item.url?.startsWith('https://page-api-discovery.fixture.test:')); if (tab?.id === undefined) return { tabs: tabs.map(item => ({ id:item.id, url:item.url })) }; return chrome.tabs.sendMessage(tab.id,{kind:'CONTENT_DOCUMENT_CONTEXT'}); })",
  );
  if (documentContext?.ok !== true)
    throw new Error(
      `Fixture document was not registered: ${JSON.stringify(documentContext)}`,
    );
  const panelRequest = (payload) =>
    evaluate(
      panel,
      `chrome.runtime.sendMessage(${JSON.stringify({
        kind: "PANEL_REQUEST",
        window_id: panelWindowId,
        payload,
      })})`,
    );
  const retiredUi = await evaluate(
    panel,
    "document.querySelector('#page-api-discovery, #discovery-dialog, #collection-discover') === null",
  );
  if (!retiredUi) throw new Error("Retired manual data UI is still present");
  const networkBaseline = fixtureRequests.length;
  for (const kind of [
    "PAGE_API_DISCOVERY_START",
    "PAGE_API_DISCOVERY_STOP",
    "COLLECTION_DISCOVER",
    "COLLECTION_READ_START",
    "COLLECTION_READ_NEXT",
    "COLLECTION_READ_CANCEL",
    "COLLECTION_READ_STATE",
  ]) {
    const response = await panelRequest({ kind });
    if (response?.ok !== false || response?.code !== "INVALID_ARGUMENT")
      throw new Error(`Retired discovery message was accepted: ${kind}`);
  }
  if (fixtureRequests.length !== networkBaseline)
    throw new Error(
      "Retired discovery message caused fixture network activity",
    );
  console.log(
    "Chrome manual data entrypoint retirement passed: UI absent, messages rejected",
  );
} finally {
  child?.kill("SIGTERM");
  if (child)
    await new Promise((resolveClose) => child.once("close", resolveClose));
  if (fixture) await new Promise((resolveClose) => fixture.close(resolveClose));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  await rm(certificateDirectory, {
    recursive: true,
    force: true,
    maxRetries: 3,
  });
}
