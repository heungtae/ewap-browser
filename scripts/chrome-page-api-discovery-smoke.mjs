/* global console, fetch, process, URL */
/** Controlled Chrome evidence for S10-C3's redacted Discovery boundary. */
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
let fixture;
let child;
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
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--ignore-certificate-errors",
      "--host-resolver-rules=MAP page-api-discovery.fixture.test 127.0.0.1",
      `--user-data-dir=${profile}`,
      `--disable-extensions-except=${resolve("dist-extension")}`,
      `--load-extension=${resolve("dist-extension")}`,
      `--remote-debugging-port=${cdpPort}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const version = await waitFor(
    () =>
      fetch(`http://127.0.0.1:${cdpPort}/json/version`)
        .then((r) => r.json())
        .catch(() => undefined),
    10_000,
    "Chrome for Testing did not open CDP",
  );
  const fixtureTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    {
      url: `https://page-api-discovery.fixture.test:${fixturePort}/`,
    },
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
  const discover = async () =>
    panelRequest({ kind: "PAGE_API_DISCOVERY_START" });
  const first = await discover();
  if (
    first?.result?.terminal !== "COMPLETED" ||
    first.result.candidates?.length < 3
  )
    throw new Error(
      `Discovery did not return fixture hints: ${JSON.stringify(first)}`,
    );
  const serialized = JSON.stringify(first);
  const forbidden = [
    "demoControls",
    "openFixture",
    "listSummary",
    "fixture-api",
    "privateBackdoor",
    "external-only",
  ].filter((value) => serialized.includes(value));
  if (forbidden.length > 0)
    throw new Error(
      `Discovery leaked page implementation: ${forbidden.join(", ")}`,
    );
  if (
    !first.result.candidates.every((candidate) =>
      /^((Public function)|(Inline endpoint)) hint \d+$/.test(candidate.label),
    )
  )
    throw new Error(`Discovery labels were not redacted: ${serialized}`);
  await evaluate(
    fixtureTarget,
    "document.querySelector('#add-oversized-script').click()",
  );
  const second = await discover();
  if (
    second?.result?.terminal !== "COMPLETED" ||
    second.result.truncated !== true
  )
    throw new Error(
      `Discovery truncation was not preserved: ${JSON.stringify(second)}`,
    );
  console.log(
    "Chrome Page API Discovery passed: real Side Panel, redacted hints, no invocation, truncation",
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
