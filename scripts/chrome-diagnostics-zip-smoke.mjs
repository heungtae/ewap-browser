/**
 * Controlled Chrome diagnostics ZIP evidence in the real Side Panel.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createDiagnosticsFixture } from "./chrome-diagnostics-fixture.mjs";
import { checkDiagnosticsZip } from "./chrome-diagnostics-zip-check.mjs";
import { openAnalysisPanel } from "./chrome-analysis-panel.mjs";
import { cdp, evaluate, reservePort, waitFor } from "./chrome-cdp-utils.mjs";

const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable)
  throw new Error("CHROME_FOR_TESTING_BIN must point to Chrome for Testing");

const certificateDirectory = await mkdtemp(
  join(tmpdir(), "contextpilot-analysis-cert-"),
);
const profile = await mkdtemp(join(tmpdir(), "contextpilot-analysis-profile-"));
const providerRequests = [];
let fixture;
let child;
try {
  const fixtureServer = await createDiagnosticsFixture(
    certificateDirectory,
    providerRequests,
  );
  fixture = fixtureServer.fixture;
  const { fixturePort } = fixtureServer;
  const cdpPort = await reservePort();
  child = spawn(
    executable,
    [
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--ignore-certificate-errors",
      "--host-resolver-rules=MAP analysis.fixture.test 127.0.0.1",
      `--user-data-dir=${profile}`,
      `--disable-extensions-except=${resolve("dist-extension")}`,
      `--load-extension=${resolve("dist-extension")}`,
      `--remote-debugging-port=${cdpPort}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const version = await waitFor(
    async () =>
      fetch(`http://127.0.0.1:${cdpPort}/json/version`)
        .then((response) => response.json())
        .catch(() => undefined),
    90_000,
    "Chrome for Testing did not open CDP",
  );
  const fixtureTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    {
      url: `https://analysis.fixture.test:${fixturePort}/`,
    },
  );
  const fixturePage = await waitFor(
    async () => {
      const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
        (response) => response.json(),
      );
      return targets.find((target) => target.id === fixtureTarget.targetId);
    },
    10_000,
    "analysis fixture page target was not created",
  );
  const worker = await waitFor(
    async () => {
      const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
        (response) => response.json(),
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
  const send = (payload) =>
    evaluate(
      panel,
      `chrome.runtime.sendMessage(${JSON.stringify({ kind: "PANEL_REQUEST", window_id: panelWindowId, payload })})`,
    );
  await evaluate(
    panel,
    `(() => {
    window.diagnosticsDownloads = [];
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      blob.arrayBuffer().then(buffer => window.diagnosticsDownloads.push(Array.from(new Uint8Array(buffer))));
      return original(blob);
    };
    HTMLAnchorElement.prototype.click = function() {
      window.diagnosticsFilename = this.download;
    };
    return true;
  })()`,
  );
  const download = async (errorCard = false) => {
    const baseline = await evaluate(panel, "diagnosticsDownloads.length");
    const clicked = await evaluate(
      panel,
      errorCard
        ? `(() => { const button = [...document.querySelectorAll('#chat-messages button')].reverse().find(item => item.textContent === '진단 다운로드'); if (!button) return false; button.click(); return true; })()`
        : "(() => { document.querySelector('#diagnostics-export').click(); return true; })()",
    );
    if (!clicked) throw new Error("diagnostics button missing");
    const bytes = await waitFor(
      () =>
        evaluate(
          panel,
          `diagnosticsDownloads.length > ${baseline} ? diagnosticsDownloads.at(-1) : null`,
        ),
      10000,
      "ZIP was not produced",
    );
    const filename = await evaluate(panel, "diagnosticsFilename");
    if (!/^contextpilot-diagnostics-.*\.zip$/.test(filename))
      throw new Error("invalid ZIP filename");
    return checkDiagnosticsZip(bytes);
  };
  const noId = await download();
  if (noId["request.json"].code !== "REQUEST_ID_NOT_PROVIDED")
    throw new Error("missing-ID reason absent");
  if (
    !noId["page-load.json"].document.table_shape.some(
      (item) => item.rows === 25 && item.columns === 6,
    )
  )
    throw new Error("25x6 table metadata missing");
  await evaluate(
    fixturePage,
    `(() => {
    for (let index = 0; index < 101; index++) {
      const script = document.createElement('script');
      script.type = 'application/json';
      script.dataset.diagnosticsExtra = 'true';
      script.textContent = '{"secret":"DIAGNOSTICS_SECRET_SCRIPT"}';
      document.body.append(script);
    }
    return true;
  })()`,
  );
  const truncated = await download();
  if (
    truncated["manifest.json"].sections.page_artifacts.status !== "truncated" ||
    truncated["page-artifacts.json"].artifacts.scripts.digests.length !== 100
  )
    throw new Error("content cap was not reflected in ZIP manifest");
  await evaluate(
    fixturePage,
    "(() => { document.querySelectorAll('[data-diagnostics-extra]').forEach(script => script.remove()); return true; })()",
  );
  await evaluate(
    panel,
    `chrome.storage.local.set({provider_settings:{schema_version:1,providers:{fixture:{plugin_id:'contextpilot.openai-compatible',plugin_version:'1.0.0',label:'fixture',base_url:'https://analysis.fixture.test:${fixturePort}/v1',wire_api:'chat_completions',model:'fixture',api_key:'DIAGNOSTICS_SECRET_KEY',api_key_header:'authorization_bearer',headers:[],timeout_ms:120000,enabled:true}},active_provider:'fixture'}})`,
  );
  await send({
    schema_version: 1,
    kind: "DIAGNOSTICS_SETTINGS_SET",
    level: "trace",
  });
  const submit = () =>
    evaluate(
      panel,
      "(() => { document.querySelector('#chat-input').value='DIAGNOSTICS_SECRET_PROMPT'; document.querySelector('#chat-form').requestSubmit(); return true; })()",
    );
  await submit();
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('#chat-messages')?.textContent.includes('DIAGNOSTICS_SECRET_RESPONSE')",
      ),
    20000,
    "provider answer absent",
  );
  const normal = await download();
  const requestId = normal["manifest.json"].request_id;
  if (!requestId || normal["request.json"].status !== "collected")
    throw new Error("normal request metadata missing");
  fixtureServer.setFailure(true);
  await submit();
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('.event-card[data-kind=error]') !== null",
      ),
    20000,
    "provider failure card absent",
  );
  const failed = await download(true);
  if (failed["request.json"].data?.outcome !== "FAILED")
    throw new Error(
      `provider failure missing: ${JSON.stringify(failed["request.json"])}`,
    );
  const footer = await download();
  if (footer["manifest.json"].request_id !== failed["manifest.json"].request_id)
    throw new Error("UI paths disagree");
  await cdp(fixturePage.webSocketDebuggerUrl, "Page.navigate", {
    url: `https://analysis.fixture.test:${fixturePort}/next?DIAGNOSTICS_SECRET_URL#DIAGNOSTICS_SECRET_FRAGMENT`,
  });
  await waitFor(
    () =>
      evaluate(
        fixturePage,
        "document.readyState === 'complete' && location.pathname === '/next'",
      ),
    10000,
    "navigation failed",
  );
  const navigated = await download();
  if (
    navigated["request.json"].status !== "collected" ||
    navigated["page-load.json"].document_epoch_digest ===
      normal["page-load.json"].document_epoch_digest
  )
    throw new Error("navigation ownership or document digest invalid");
  const missing = await send({
    schema_version: 1,
    kind: "DIAGNOSTICS_BUNDLE_EXPORT",
    request_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  if (
    missing?.data?.sections?.request?.code !== "REQUEST_NOT_FOUND" ||
    missing?.data?.sections?.execution_trace?.status !== "collected"
  )
    throw new Error("unknown request failed whole export");
  await cdp(version.webSocketDebuggerUrl, "Target.closeTarget", {
    targetId: worker.id,
  });
  await waitFor(
    async () => {
      const reply = await send({
        schema_version: 1,
        kind: "DIAGNOSTICS_BUNDLE_EXPORT",
        request_id: requestId,
      }).catch(() => undefined);
      return reply?.ok && reply.data.sections.request.status === "collected";
    },
    10000,
    "worker restart lost persisted request",
  );
  const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
    (response) => response.json(),
  );
  if (
    !targets.some(
      (target) => target.type === "service_worker" && target.id !== worker.id,
    )
  )
    throw new Error("worker was not restarted");
  await download();
  await cdp(fixturePage.webSocketDebuggerUrl, "Page.navigate", {
    url: "about:blank",
  });
  await waitFor(
    () => evaluate(fixturePage, "location.href === 'about:blank'"),
    10000,
    "blank navigation failed",
  );
  const unavailable = await download();
  if (
    unavailable["page-load.json"].status !== "unavailable" ||
    unavailable["execution-trace.json"].status !== "collected"
  )
    throw new Error("content failure prevented independent ZIP");
  if (providerRequests.length !== 2)
    throw new Error("diagnostics sent extra provider requests");
  console.log(
    "Chrome diagnostics ZIP passed: real Panel, 25x6 metadata, both buttons, truncation, normal/provider failure, navigation, missing IDs, worker restart, independent content failure, hashes/CRC/redaction; provider requests=2",
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
