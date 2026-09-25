/** S5 Chrome evidence: provider stream, real worker restart and Panel UI. */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { openAnalysisPanel } from "./chrome-analysis-panel.mjs";
import { cdp, evaluate, reservePort, waitFor } from "./chrome-cdp-utils.mjs";
import { createS3Fixture } from "./chrome-s3-fixture.mjs";
import { checkS5Ui } from "./chrome-s5-ui-check.mjs";
import { checkS5Lifecycle } from "./chrome-s5-lifecycle.mjs";

const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable) throw new Error("CHROME_FOR_TESTING_BIN is required");
const certificateDirectory = await mkdtemp(join(tmpdir(), "s5-cert-"));
const profile = await mkdtemp(join(tmpdir(), "s5-profile-"));
let fixtureData;
let child;
try {
  fixtureData = await createS3Fixture(certificateDirectory);
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
    "S5_CHROME_NOT_READY",
  );
  const fixtureTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    { url: `https://s1.fixture.test:${fixtureData.fixturePort}/` },
  );
  const targets = () =>
    fetch(`http://127.0.0.1:${cdpPort}/json/list`).then((response) =>
      response.json(),
    );
  const worker = await waitFor(
    async () =>
      (await targets()).find(
        (target) =>
          target.type === "service_worker" &&
          target.url.endsWith("/js/service-worker.js"),
      ),
    10_000,
    "S5_WORKER_NOT_READY",
  );
  const extensionId = new URL(worker.url).host;
  let { panel, panelWindowId } = await openAnalysisPanel({
    cdpPort,
    extensionId,
    fixtureTarget,
    version,
    worker,
  });
  const provider = {
    plugin_id: "contextpilot.openai-compatible",
    plugin_version: "1.0.0",
    label: "S5 fixture",
    base_url: `https://s1.fixture.test:${fixtureData.fixturePort}/v1`,
    wire_api: "chat_completions",
    model: "fixture-model",
    api_key: "",
    api_key_header: "none",
    headers: [],
    timeout_ms: 30_000,
    enabled: true,
  };
  const resolver = {
    schema_version: 1,
    deployment_id: "s1-fixture",
    url: `https://s1.fixture.test:${fixtureData.fixturePort}/v1/resolve`,
    allowed_origins: [`https://s1.fixture.test:${fixtureData.fixturePort}`],
    key_ring: { s1: fixtureData.publicKey },
  };
  await evaluate(
    panel,
    `chrome.storage.local.set(${JSON.stringify({ profile_resolver: resolver })})`,
  );
  const saved = await evaluate(
    panel,
    `chrome.runtime.sendMessage(${JSON.stringify({ kind: "PROVIDER_SAVE", payload: { id: "fixture", config: provider } })})`,
  );
  if (saved?.ok !== true) throw new Error("S5_PROVIDER_SAVE_FAILED");
  await evaluate(
    panel,
    `(() => {document.querySelector('#mode-ask').click();document.querySelector('#chat-input').value='S5 dense 1000';document.querySelector('#chat-form').requestSubmit();return true})()`,
  );
  const expected = "abcdefghij".repeat(100);
  await waitFor(
    async () =>
      (await evaluate(
        panel,
        `document.querySelector('.message[data-role=assistant]')?.textContent === ${JSON.stringify(expected)} && document.querySelector('#chat-send')?.dataset.state === 'send'`,
      )) === true,
    20_000,
    "S5_DENSE_STREAM_MISMATCH",
  );
  if (fixtureData.captures.length !== 1)
    throw new Error("S5_DENSE_STREAM_DUPLICATED_PROVIDER_CALL");
  await cdp(version.webSocketDebuggerUrl, "Target.closeTarget", {
    targetId: worker.id,
  });
  await evaluate(panel, "chrome.runtime.sendMessage({kind:'CHAT_RECOVER'})");
  await waitFor(
    async () =>
      (await targets()).some(
        (target) =>
          target.type === "service_worker" &&
          target.url.endsWith("/js/service-worker.js") &&
          target.id !== worker.id,
      ),
    10_000,
    "S5_WORKER_DID_NOT_RESTART",
  );
  await waitFor(
    () =>
      evaluate(
        panel,
        `document.querySelector('.message[data-role=assistant]')?.textContent === ${JSON.stringify(expected)}`,
      ),
    10_000,
    "S5_WORKER_RECONNECT_LOST_TRANSCRIPT",
  );
  const lifecycle = await checkS5Lifecycle({
    panel,
    panelWindowId,
    fixtureData,
    targets,
    version,
    extensionId,
  });
  panel = lifecycle.panel;
  await checkS5Ui(panel.webSocketDebuggerUrl);
  console.log(
    `S5 Chrome passed: 1,000 provider SSE deltas, worker restart, Panel reopen=${lifecycle.recovery}, event/Stop/a11y checks`,
  );
} finally {
  child?.kill("SIGTERM");
  if (child)
    await new Promise((resolveClose) => child.once("close", resolveClose));
  if (fixtureData)
    await new Promise((resolveClose) =>
      fixtureData.fixture.close(resolveClose),
    );
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  await rm(certificateDirectory, {
    recursive: true,
    force: true,
    maxRetries: 3,
  });
}
