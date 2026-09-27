/** S14 Chrome evidence: recorded workflow comparison and both recheck gates. */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { semanticFingerprint } from "../dist/profile/fingerprint.js";
import { openAnalysisPanel } from "./chrome-analysis-panel.mjs";
import { cdp, evaluate, reservePort, waitFor } from "./chrome-cdp-utils.mjs";
import { createS7Fixture } from "./chrome-s7-fixture.mjs";

const executable = process.env.CHROME_FOR_TESTING_BIN;
if (!executable) throw new Error("CHROME_FOR_TESTING_BIN is required");
const recordId = "recordedworkflow01";
const selectionKey = "contextpilot_pending_workflow_selections_v1";
const send = (panel, message) =>
  evaluate(panel, `chrome.runtime.sendMessage(${JSON.stringify(message)})`);
const mutate = (page, add) =>
  evaluate(
    page,
    add
      ? "(() => {const extra=document.createElement('button');extra.id='s14-extra';extra.textContent='Extra action';document.querySelector('main').append(extra);return true})()"
      : "(() => {document.querySelector('#s14-extra')?.remove();return true})()",
  );

const setReadScope = async ({
  cdpPort,
  version,
  extensionId,
  fixtureTarget,
}) => {
  const created = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    {
      url: `chrome-extension://${extensionId}/settings/index.html`,
    },
  );
  try {
    const settings = await waitFor(
      async () => {
        const targets = await fetch(
          `http://127.0.0.1:${cdpPort}/json/list`,
        ).then((response) => response.json());
        return targets.find((item) => item.id === created.targetId);
      },
      10_000,
      "S14_SETTINGS_NOT_READY",
    );
    await waitFor(
      () =>
        evaluate(
          settings,
          "document.querySelector('#agent-preferences-form') !== null",
        ),
      10_000,
      "S14_SETTINGS_FORM_MISSING",
    );
    const current = await evaluate(
      settings,
      "chrome.runtime.sendMessage({kind:'AGENT_PREFERENCES_GET'})",
    );
    if (current?.ok !== true) throw new Error("S14_PREFERENCES_GET_FAILED");
    const response = await evaluate(
      settings,
      `chrome.runtime.sendMessage(${JSON.stringify({
        kind: "AGENT_PREFERENCES_SAVE",
        payload: {
          preferences: {
            ...current.preferences,
            default_read_scope: "visible_only",
          },
          acknowledgement: "",
        },
      })})`,
    );
    if (response?.ok !== true)
      throw new Error(`S14_READ_SCOPE_SAVE_FAILED: ${response?.code}`);
  } finally {
    await cdp(version.webSocketDebuggerUrl, "Target.closeTarget", {
      targetId: created.targetId,
    });
    await cdp(version.webSocketDebuggerUrl, "Target.activateTarget", {
      targetId: fixtureTarget.targetId,
    });
  }
};

const runCase = async (kind) => {
  const certificateDirectory = await mkdtemp(join(tmpdir(), "s14-cert-"));
  const profile = await mkdtemp(join(tmpdir(), "s14-profile-"));
  let fixtureData;
  let child;
  try {
    fixtureData = await createS7Fixture(certificateDirectory, "case");
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
      "S14_CHROME_NOT_READY",
    );
    const fixtureTarget = await cdp(
      version.webSocketDebuggerUrl,
      "Target.createTarget",
      {
        url: `https://s1.fixture.test:${fixtureData.fixturePort}/`,
      },
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
      "S14_WORKER_NOT_READY",
    );
    const extensionId = new URL(worker.url).host;
    const { panel } = await openAnalysisPanel({
      cdpPort,
      extensionId,
      fixtureTarget,
      version,
      worker,
    });
    const page = await waitFor(
      async () =>
        (await targets()).find(
          (target) => target.id === fixtureTarget.targetId,
        ),
      10_000,
      "S14_PAGE_NOT_READY",
    );
    const tabId = await evaluate(
      panel,
      "chrome.tabs.query({active:true,lastFocusedWindow:true}).then(tabs=>tabs[0]?.id)",
    );
    if (!Number.isInteger(tabId)) throw new Error("S14_TAB_NOT_BOUND");
    const response = await waitFor(
      () =>
        evaluate(
          panel,
          `chrome.tabs.sendMessage(${tabId},{kind:'CONTENT_SNAPSHOT',scope:'all_dom'}).catch(()=>undefined)`,
        ),
      10_000,
      "S14_SNAPSHOT_UNAVAILABLE",
    );
    const snapshot = response?.snapshot?.snapshot;
    if (
      response?.ok !== true ||
      snapshot?.scope !== "all_dom" ||
      snapshot.truncated !== false
    )
      throw new Error("S14_COMPLETE_SNAPSHOT_MISSING");
    const origin = `https://s1.fixture.test:${fixtureData.fixturePort}`;
    const timestamp = new Date().toISOString();
    const record = {
      id: recordId,
      title: "S14 recorded",
      enabled: true,
      origin,
      path_prefix: "/",
      fingerprint: semanticFingerprint(snapshot).fingerprint,
      created_at: timestamp,
      updated_at: timestamp,
      declaration: {
        schema_version: 1,
        id: recordId,
        title: "S14 recorded",
        steps: [
          {
            id: "archive",
            tool: "click_by_ref",
            target: { role: "button", name: "Archive case" },
          },
        ],
      },
    };
    await evaluate(
      panel,
      `chrome.storage.local.set(${JSON.stringify({ saved_workflows_v1: { schema_version: 1, records: [record] } })})`,
    );
    if (kind === "incomparable")
      await setReadScope({ cdpPort, version, extensionId, fixtureTarget });
    if (kind === "stale") await mutate(page, true);
    const config = {
      plugin_id: "contextpilot.openai-compatible",
      plugin_version: "1.0.0",
      label: "S14 fixture",
      base_url: `${origin}/v1`,
      wire_api: "chat_completions",
      model: "fixture-model",
      api_key: "",
      api_key_header: "none",
      headers: [],
      timeout_ms: 30_000,
      enabled: true,
    };
    if (
      (
        await send(panel, {
          kind: "PROVIDER_SAVE",
          payload: { id: "fixture", config },
        })
      )?.ok !== true
    )
      throw new Error("S14_PROVIDER_SAVE_FAILED");
    await evaluate(
      panel,
      "(() => {document.querySelector('#mode-act').click();document.querySelector('#chat-input').value='Archive case';document.querySelector('#chat-form').requestSubmit();return true})()",
    );
    const selection = await waitFor(
      () =>
        evaluate(
          panel,
          `chrome.storage.session.get(${JSON.stringify(selectionKey)}).then(value=>value[${JSON.stringify(selectionKey)}]?.selections?.[0])`,
        ),
      12_000,
      "S14_CANDIDATES_NOT_SHOWN",
    );
    const candidate = selection.candidates?.find(
      (entry) => entry.candidate?.id === recordId,
    )?.candidate;
    const expected = kind === "verified" ? "verified" : kind;
    if (candidate?.status !== expected)
      throw new Error(
        `S14_CANDIDATE_STATUS: ${candidate?.status} expected ${expected}`,
      );
    const button = await waitFor(
      () =>
        evaluate(
          panel,
          "(() => {const card=[...document.querySelectorAll('.event-card[data-kind=review]')].find(item=>item.textContent.includes('워크플로우 보기'));const button=[...(card?.querySelectorAll('button')??[])].find(item=>item.textContent.includes('S14 recorded'));return button?{disabled:button.disabled,text:button.textContent}:undefined})()",
        ),
      10_000,
      "S14_CANDIDATE_CARD_NOT_SHOWN",
    );
    const expectedLabel =
      kind === "stale"
        ? "페이지 변경됨"
        : kind === "incomparable"
          ? "페이지 비교 불가"
          : "단계 실행";
    if (
      !button?.text?.includes(expectedLabel) ||
      button.disabled !== (kind !== "verified")
    )
      throw new Error(`S14_CANDIDATE_UI: ${JSON.stringify(button)}`);
    if (kind !== "verified") {
      const blocked = await send(panel, {
        kind: "WORKFLOW_SELECT",
        selection_id: selection.id,
        candidate_id: recordId,
      });
      if (blocked?.code !== "WORKFLOW_STATE_MISMATCH")
        throw new Error(`S14_BLOCKED_SELECTION: ${blocked?.code}`);
    } else {
      await mutate(page, true);
      const blocked = await send(panel, {
        kind: "WORKFLOW_SELECT",
        selection_id: selection.id,
        candidate_id: recordId,
      });
      if (blocked?.code !== "WORKFLOW_STATE_MISMATCH")
        throw new Error(`S14_SELECT_RECHECK: ${blocked?.code}`);
      await mutate(page, false);
      const selected = await send(panel, {
        kind: "WORKFLOW_SELECT",
        selection_id: selection.id,
        candidate_id: recordId,
      });
      if (selected?.state !== "WORKFLOW_PLAN")
        throw new Error(`S14_VERIFIED_SELECT: ${selected?.code}`);
      await mutate(page, true);
      const start = await send(panel, {
        kind: "WORKFLOW_START",
        selection_id: selection.id,
      });
      if (start?.code !== "WORKFLOW_STATE_MISMATCH")
        throw new Error(`S14_START_RECHECK: ${start?.code}`);
    }
    if (fixtureData.providerRequests.length !== 1)
      throw new Error(
        `S14_UNEXPECTED_PROVIDER_CALLS: ${fixtureData.providerRequests.length}`,
      );
    return expected;
  } finally {
    child?.kill("SIGTERM");
    if (child) await new Promise((closed) => child.once("close", closed));
    if (fixtureData)
      await new Promise((closed) => fixtureData.fixture.close(closed));
    await rm(profile, { recursive: true, force: true, maxRetries: 3 });
    await rm(certificateDirectory, {
      recursive: true,
      force: true,
      maxRetries: 3,
    });
  }
};

const results = [];
for (const kind of ["verified", "stale", "incomparable"])
  results.push(await runCase(kind));
console.log(
  `S14 Chrome passed: ${results.join(", ")}; select/start rechecks blocked stale DOM; provider calls=3`,
);
