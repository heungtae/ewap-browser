/** S11 Chrome evidence for the signed, closed Business MCP compatibility path. */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openAnalysisPanel } from "./chrome-analysis-panel.mjs";
import { cdp, evaluate, reservePort, waitFor } from "./chrome-cdp-utils.mjs";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";

const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable) throw new Error("CHROME_FOR_TESTING_BIN is required");
const certificateDirectory = await mkdtemp(join(tmpdir(), "s11-cert-"));
const profile = await mkdtemp(join(tmpdir(), "s11-profile-"));
const binding = {
  server_id: "fixture",
  endpoint: "https://s1.fixture.test:1/v1/business",
  tool_id: "get_status",
  title: "Get status",
  description: "Read the public case status.",
  arguments: {
    type: "object",
    additionalProperties: false,
    properties: { field: { type: "string", maxLength: 24 } },
    required: ["field"],
  },
  result_key: "value",
  value_kind: "text",
  max_result_chars: 100,
};
const stream = (response, delta) => {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "access-control-allow-origin": "*",
  });
  response.end(
    `data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`,
  );
};
const providerHandler = async (_request, response, body) => {
  const messages = body.messages ?? [];
  const lastUser = messages.findLastIndex((item) => item.role === "user");
  if (messages.slice(lastUser + 1).some((item) => item.role === "tool")) {
    stream(response, { content: "S11 business answer complete" });
    return;
  }
  stream(response, {
    tool_calls: [
      {
        id: "s11-business-call",
        type: "function",
        function: {
          name: "call_page_business_tool",
          arguments: JSON.stringify({
            tool_id: "get_status",
            arguments: { field: "status" },
          }),
        },
      },
    ],
  });
};
let fixtureData;
let child;
try {
  fixtureData = await createS1Fixture(
    certificateDirectory,
    "<!doctype html><main><h1>Case status</h1><p>Public case</p></main>",
    providerHandler,
    [],
    [binding],
  );
  const { fixturePort } = fixtureData;
  binding.endpoint = `https://s1.fixture.test:${fixturePort}/v1/business`;
  const cdpPort = await reservePort();
  child = spawn(
    executable,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--ignore-certificate-errors",
      "--host-resolver-rules=MAP s1.fixture.test 127.0.0.1",
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
        .then((response) => response.json())
        .catch(() => undefined),
    10_000,
    "S11_CHROME_NOT_READY",
  );
  const fixtureTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    { url: `https://s1.fixture.test:${fixturePort}/` },
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
    "S11_WORKER_NOT_READY",
  );
  const extensionId = new URL(worker.url).host;
  const { panel } = await openAnalysisPanel({
    cdpPort,
    extensionId,
    fixtureTarget,
    version,
    worker,
  });
  const origin = `https://s1.fixture.test:${fixturePort}`;
  const settings = {
    schema_version: 1,
    deployment_id: "s11-fixture",
    url: `${origin}/v1/resolve`,
    allowed_origins: [origin],
    key_ring: { s1: fixtureData.publicKey },
  };
  const provider = {
    schema_version: 1,
    providers: {
      fixture: {
        plugin_id: "contextpilot.openai-compatible",
        plugin_version: "1.0.0",
        label: "S11 fixture",
        base_url: `${origin}/v1`,
        wire_api: "chat_completions",
        model: "fixture",
        api_key: "",
        api_key_header: "none",
        headers: [],
        timeout_ms: 120000,
        enabled: true,
      },
    },
    active_provider: "fixture",
  };
  await evaluate(
    panel,
    `chrome.storage.local.set(${JSON.stringify({
      profile_resolver: settings,
      provider_settings: provider,
    })}).then(() => true)`,
  );
  const matched = await evaluate(
    panel,
    "chrome.runtime.sendMessage({kind:'RESOLVE_PROFILE'})",
  );
  if (matched?.ok !== true || matched.profile_id !== "s1-profile")
    throw new Error(`S11_PROFILE_NOT_MATCHED: ${matched?.code}`);
  await evaluate(
    panel,
    `(() => {
    document.querySelector('#mode-ask').click();
    document.querySelector('#chat-input').value = 'Read the public case status';
    document.querySelector('#chat-form').requestSubmit();
    return true;
  })()`,
  );
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('#chat-messages')?.textContent.includes('S11 business answer complete')",
      ),
    20_000,
    "S11_ASK_RESULT_MISSING",
  );
  if (fixtureData.businessRequests.length !== 1)
    throw new Error("S11_BUSINESS_DISPATCH_COUNT_WRONG");
  const request = fixtureData.businessRequests[0];
  if (
    request.tool_id !== "get_status" ||
    request.arguments?.field !== "status" ||
    typeof request.profile_jws !== "string" ||
    typeof request.page_context_digest !== "string"
  )
    throw new Error("S11_BUSINESS_REQUEST_UNBOUND");
  const modelWire = JSON.stringify(fixtureData.providerRequests);
  if (modelWire.includes("/v1/business") || modelWire.includes("profile_jws"))
    throw new Error("S11_MODEL_CATALOG_LEAKED_BINDING");
  console.log(
    "S11 Chrome passed: signed binding, closed model catalog, Business MCP dispatch",
  );
} finally {
  child?.kill("SIGTERM");
  if (child) await new Promise((done) => child.once("close", done));
  if (fixtureData) await new Promise((done) => fixtureData.fixture.close(done));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  await rm(certificateDirectory, {
    recursive: true,
    force: true,
    maxRetries: 3,
  });
}
