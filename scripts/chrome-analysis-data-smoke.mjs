/**
 * Controlled Chrome evidence for S13. This uses a local HTTPS OpenAI-compatible
 * fixture; it proves extension wiring, not a live provider's behavior.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createAnalysisFixture } from "./chrome-analysis-data-fixture.mjs";
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
  const fixtureServer = await createAnalysisFixture(
    certificateDirectory,
    providerRequests,
  );
  fixture = fixtureServer.fixture;
  const { fixturePort } = fixtureServer;
  const cdpPort = await reservePort();
  child = spawn(
    executable,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
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
    10_000,
    "Chrome for Testing did not open CDP",
  );
  const fixtureTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    {
      url: `https://analysis.fixture.test:${fixturePort}/`,
    },
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
  const panelRequest = (payload) =>
    evaluate(
      panel,
      `chrome.runtime.sendMessage(${JSON.stringify({
        kind: "PANEL_REQUEST",
        window_id: panelWindowId,
        payload,
      })})`,
    );
  const discover = await panelRequest({ kind: "COLLECTION_DISCOVER" });
  const table = discover?.collections?.find(
    (item) => item.object_kind === "table",
  );
  if (!table)
    throw new Error(`table was not discovered: ${JSON.stringify(discover)}`);
  let permission = await panelRequest({
    kind: "COLLECTION_READ_START",
    request: { collection_ref: table.collection_ref, mode: "full" },
  });
  if (permission?.code !== "REQUIRE_PERMISSION")
    throw new Error(
      `collection permission was not requested: ${JSON.stringify(permission)}`,
    );
  permission = await panelRequest({
    kind: "PERMISSION_DECISION",
    permission_request_id: permission.request_id,
    decision: "always",
  });
  if (permission?.ok !== true)
    throw new Error("collection permission was not persisted");
  await evaluate(
    panel,
    `chrome.storage.local.set({provider_settings:{schema_version:1,providers:{fixture:{plugin_id:'contextpilot.openai-compatible',plugin_version:'1.0.0',label:'fixture',base_url:'https://analysis.fixture.test:${fixturePort}/v1',wire_api:'chat_completions',model:'fixture',api_key:'',api_key_header:'none',headers:[],timeout_ms:120000,enabled:true}},active_provider:'fixture'}})`,
  );
  const submit = (mode, prompt) =>
    evaluate(
      panel,
      `(() => { document.querySelector('#mode-${mode}').click(); document.querySelector('#chat-input').value=${JSON.stringify(prompt)}; document.querySelector('#chat-form').requestSubmit(); return true; })()`,
    );
  await submit("ask", "이 페이지 표 데이터를 분석 요약해");
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('#chat-messages')?.textContent.includes('Ask analysis fixture answer')",
      ),
    20_000,
    "Ask did not complete through the controlled provider",
  );
  await submit("act", "표 데이터를 분석하고 저장해");
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('#chat-messages')?.textContent.includes('Act analysis fixture answer')",
      ),
    20_000,
    "Act did not complete through the controlled provider",
  );
  const analysisRequests = providerRequests.filter((request) =>
    request.messages?.some(
      (message) =>
        typeof message.content === "string" &&
        message.content.includes("[UNTRUSTED_ANALYSIS_DATA]"),
    ),
  );
  if (analysisRequests.length !== 2)
    throw new Error(
      `expected Ask and Act analysis provider turns: ${JSON.stringify(providerRequests)}`,
    );
  for (const request of analysisRequests) {
    const analysisContent = request.messages.find(
      (message) =>
        typeof message.content === "string" &&
        message.content.includes("[UNTRUSTED_ANALYSIS_DATA]"),
    )?.content;
    if (typeof analysisContent !== "string")
      throw new Error("analysis context was not a provider message");
    const forbidden = [
      "collection_ref",
      "container_xpath",
      "row_id",
      "aria_row_index",
      "not-for-provider",
    ].filter((value) => analysisContent.includes(value));
    if (
      !analysisContent.includes('"coverage":"complete"') ||
      !analysisContent.includes('"collected_count":4') ||
      forbidden.length > 0
    )
      throw new Error(
        `analysis context boundary mismatch (${forbidden.join(",")}): ${analysisContent}`,
      );
  }
  console.log(
    "Chrome Ask/Act analysis data passed: real Side Panel, collection permission, bounded context, controlled provider",
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
