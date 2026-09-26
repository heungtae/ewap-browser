/** S9: unpacked ZIP upgrade and rollback in one clean Chrome profile. */
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { evaluate, waitFor } from "./chrome-cdp-utils.mjs";
import { createS7Fixture } from "./chrome-s7-fixture.mjs";
import { setS8Mode } from "./chrome-s8-settings.mjs";
import {
  assertFreshSession,
  candidate,
  certificateDirectory,
  close,
  launch,
  prepareCandidate,
  preparePrevious,
  previous,
  temporary,
} from "./chrome-s9-upgrade-support.mjs";

const submit = (panel) =>
  evaluate(
    panel,
    "(() => {document.querySelector('#mode-act').click();document.querySelector('#chat-input').value='Archive case';document.querySelector('#chat-form').requestSubmit();return true})()",
  );
const cardCount = (panel, kind) =>
  evaluate(
    panel,
    `document.querySelectorAll('.event-card[data-kind="${kind}"]').length`,
  );
const clickCard = (panel, kind, label) =>
  evaluate(
    panel,
    `(() => {const card=[...document.querySelectorAll('.event-card[data-kind="${kind}"]')].at(-1);const button=[...card.querySelectorAll('button')].find(item=>item.textContent===${JSON.stringify(label)});if(!button)throw Error('S9_BUTTON_MISSING');button.click();return true})()`,
  );
const snapshot = (panel) =>
  evaluate(
    panel,
    "Promise.all([chrome.runtime.sendMessage({kind:'AGENT_PREFERENCES_GET'}),chrome.storage.local.get(['agent_preferences','contextpilot_permissions']),chrome.runtime.sendMessage({kind:'PROVIDER_LIST'})]).then(([result,storage,list])=>({mode:result.preferences?.permission_mode,storedMode:storage.agent_preferences?.permission_mode,permissions:storage.contextpilot_permissions,provider:list.providers?.fixture}))",
  );
const initial = async (browser, fixtureData) => {
  const { panel, page } = browser;
  const origin = `https://s1.fixture.test:${fixtureData.fixturePort}`;
  await evaluate(
    panel,
    `chrome.storage.local.set(${JSON.stringify({
      profile_resolver: {
        schema_version: 1,
        deployment_id: "s1-fixture",
        url: `${origin}/v1/resolve`,
        allowed_origins: [origin],
        key_ring: { s1: fixtureData.publicKey },
      },
    })})`,
  );
  const config = {
    plugin_id: "contextpilot.openai-compatible",
    plugin_version: "1.0.0",
    label: "S9 fixture",
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
      await evaluate(
        panel,
        `chrome.runtime.sendMessage(${JSON.stringify({ kind: "PROVIDER_SAVE", payload: { id: "fixture", config } })})`,
      )
    )?.ok !== true
  )
    throw new Error("S9_PROVIDER_SAVE_FAILED");
  await submit(panel);
  await waitFor(() => cardCount(panel, "review"), 12_000, "S9_REVIEW_MISSING");
  await clickCard(panel, "review", "이번 단계 실행");
  await waitFor(
    () => cardCount(panel, "permission"),
    10_000,
    "S9_PERMISSION_MISSING",
  );
  await clickCard(panel, "permission", "거부");
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('#chat-send')?.dataset.state === 'send'",
      ),
    10_000,
    "S9_DENIAL_NOT_SETTLED",
  );
  if (
    await evaluate(
      page,
      "document.querySelector('#target').dataset.trusted === 'yes'",
    )
  )
    throw new Error("S9_DENIED_ACTION_EXECUTED");
  await setS8Mode({ ...browser, mode: "skip_all_permission_checks" });
  return snapshot(panel);
};
const check = async (browser, expected, checkBadge = true) => {
  const state = await snapshot(browser.panel);
  if (JSON.stringify(state) !== JSON.stringify(expected))
    throw new Error(
      `S9_MIGRATION_MISMATCH: ${JSON.stringify({ state, expected })}`,
    );
  if (
    state.mode !== "skip_all_permission_checks" ||
    state.provider?.model !== "fixture-model" ||
    !state.permissions?.some(
      (item) =>
        item.capability === "click" &&
        item.host === "s1.fixture.test" &&
        item.action === "deny",
    )
  )
    throw new Error("S9_MODE_OR_PERMISSION_NOT_RESTORED");
  if (checkBadge)
    await waitFor(
      () =>
        evaluate(
          browser.panel,
          "document.querySelector('#permission-mode-badge')?.dataset.mode",
        ).then((mode) => mode === state.mode),
      10_000,
      "S9_MODE_BADGE_NOT_RESTORED",
    );
};
const checkDeniedAction = async ({ panel, page }) => {
  const reviews = await cardCount(panel, "review");
  const errors = await cardCount(panel, "error");
  await submit(panel);
  await waitFor(
    () => cardCount(panel, "review").then((count) => count > reviews),
    12_000,
    "S9_RESTORED_REVIEW_MISSING",
  );
  await clickCard(panel, "review", "이번 단계 실행");
  await waitFor(
    () => cardCount(panel, "error").then((count) => count > errors),
    10_000,
    "S9_RESTORED_DENY_BYPASSED",
  );
  if (
    await evaluate(
      page,
      "document.querySelector('#target').dataset.trusted === 'yes' || document.querySelector('#target').disabled",
    )
  )
    throw new Error("S9_RESTORED_DENIAL_EXECUTED");
};
let fixtureData;
let browser;
try {
  const previousVersion = await preparePrevious();
  const { currentVersion, archiveHash } = await prepareCandidate();
  if (previousVersion === currentVersion)
    throw new Error("S9_VERSIONS_ARE_EQUAL");
  await mkdir(certificateDirectory);
  fixtureData = await createS7Fixture(certificateDirectory, "case");
  const ids = [];
  browser = await launch(
    join(previous, "dist-extension"),
    fixtureData,
    previousVersion,
  );
  ids.push(browser.extensionId);
  const expected = await initial(browser, fixtureData);
  await check(browser, expected, false);
  await close(browser);
  browser = undefined;
  browser = await launch(candidate, fixtureData, currentVersion);
  ids.push(browser.extensionId);
  await assertFreshSession(browser.panel);
  await check(browser, expected);
  await checkDeniedAction(browser);
  await close(browser);
  browser = undefined;
  browser = await launch(
    join(previous, "dist-extension"),
    fixtureData,
    previousVersion,
  );
  ids.push(browser.extensionId);
  await assertFreshSession(browser.panel);
  await check(browser, expected);
  await checkDeniedAction(browser);
  if (new Set(ids).size !== 1) throw new Error("S9_EXTENSION_ID_CHANGED");
  console.log(
    `S9 Chrome upgrade passed: ${previousVersion} -> ${currentVersion} -> ${previousVersion}; one profile, same extension ID, mode and stored denial, fresh session; zip sha256=${archiveHash}`,
  );
} finally {
  if (browser) await close(browser);
  if (fixtureData) await new Promise((done) => fixtureData.fixture.close(done));
  await rm(temporary, { recursive: true, force: true, maxRetries: 3 });
}
