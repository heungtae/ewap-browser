import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import {
  cdp,
  evaluate,
  reservePort,
  sleep,
  waitFor,
} from "./chrome-cdp-utils.mjs";
import { openAnalysisPanel } from "./chrome-analysis-panel.mjs";
export const openS19Chrome = async ({ executable, fixture, liveModel }) => {
  const profile = await mkdtemp(join(tmpdir(), "contextpilot-s19-profile-"));
  const port = await reservePort();
  const launch = () =>
    spawn(
      executable,
      [
        "--headless=new",
        "--window-size=1440,1100",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--ignore-certificate-errors",
        "--host-resolver-rules=MAP s1.fixture.test 127.0.0.1",
        `--user-data-dir=${profile}`,
        `--load-extension=${resolve("dist-extension")}`,
        `--disable-extensions-except=${resolve("dist-extension")}`,
        `--remote-debugging-port=${port}`,
        "about:blank",
      ],
      { stdio: "ignore" },
    );
  let child = launch();
  let version = await waitFor(
    () =>
      fetch(`http://127.0.0.1:${port}/json/version`)
        .then((response) => response.json())
        .catch(() => undefined),
    15000,
    "CHROME_READY",
  );
  const targets = () =>
    fetch(`http://127.0.0.1:${port}/json/list`).then((response) =>
      response.json(),
    );
  let worker = await waitFor(
    async () =>
      (await targets()).find(
        (target) =>
          target.type === "service_worker" &&
          target.url.endsWith("/js/service-worker.js"),
      ),
    15000,
    "WORKER_READY",
  );
  const extensionId = new URL(worker.url).host;
  // Isolated test-profile grant mirrors S6 capture qualification. Product consent
  // still requests Chrome permission through the actual user-click path.
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("close", resolve));
  const preferencesPath = join(profile, "Default/Preferences");
  const preferences = JSON.parse(await readFile(preferencesPath, "utf8"));
  const extension = preferences.extensions.settings[extensionId];
  for (const state of [
    extension.granted_permissions,
    extension.active_permissions,
  ])
    state.explicit_host = [...new Set([...state.explicit_host, "<all_urls>"])];
  await writeFile(preferencesPath, JSON.stringify(preferences));
  child = launch();
  version = await waitFor(
    () =>
      fetch(`http://127.0.0.1:${port}/json/version`)
        .then((r) => r.json())
        .catch(() => undefined),
    15000,
    "CHROME_RESTART",
  );
  worker = await waitFor(
    async () =>
      (await targets()).find(
        (t) =>
          t.type === "service_worker" &&
          t.url.endsWith("/js/service-worker.js"),
      ),
    15000,
    "WORKER_RESTART",
  );
  const fixtureTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    { url: `https://s1.fixture.test:${fixture.fixturePort}/` },
  );
  const page = await waitFor(
    async () =>
      (await targets()).find((target) => target.id === fixtureTarget.targetId),
    10000,
    "PAGE_READY",
  );
  const { panel } = await openAnalysisPanel({
    cdpPort: port,
    extensionId,
    fixtureTarget,
    version,
    worker,
  });
  const send = (message) =>
    evaluate(panel, `chrome.runtime.sendMessage(${JSON.stringify(message)})`);
  assert.equal(
    (
      await send({
        kind: "PROVIDER_SAVE",
        payload: {
          id: "fixture",
          config: {
            plugin_id: "contextpilot.openai-compatible",
            plugin_version: "1.0.0",
            label: "S19 component fixture",
            base_url: `https://s1.fixture.test:${fixture.fixturePort}/v1`,
            wire_api: "chat_completions",
            model: "fixture",
            api_key: "",
            api_key_header: "none",
            headers: [],
            timeout_ms: liveModel ? 90000 : 15000,
            enabled: true,
          },
        },
      })
    ).ok,
    true,
  );
  await evaluate(
    panel,
    `(()=>{window.__downloads=[];const original=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{blob.arrayBuffer().then(buffer=>window.__downloads.push(Array.from(new Uint8Array(buffer))));return original(blob)};HTMLAnchorElement.prototype.click=function(){};return true})()`,
  );
  return {
    panel,
    page,
    version,
    fixtureTarget,
    send,
    async close() {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("close", resolve));
      await rm(profile, { recursive: true, force: true, maxRetries: 3 });
    },
  };
};
