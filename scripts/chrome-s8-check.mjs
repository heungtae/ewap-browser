import { evaluate, waitFor } from "./chrome-cdp-utils.mjs";
import { setS8Mode } from "./chrome-s8-settings.mjs";
import { checkS8Transition } from "./chrome-s8-transition.mjs";
import { checkS8PlanExpiry } from "./chrome-s8-plan-expiry.mjs";

const send = (panel, message) =>
  evaluate(panel, `chrome.runtime.sendMessage(${JSON.stringify(message)})`);
const hasCard = (panel, kind) =>
  evaluate(
    panel,
    `document.querySelector('.event-card[data-kind="${kind}"]') !== null`,
  );
const clickCard = (panel, kind, label) =>
  evaluate(
    panel,
    `(() => {const card=[...document.querySelectorAll('.event-card[data-kind="${kind}"]')].at(-1);const button=[...card.querySelectorAll('button')].find(item=>item.textContent===${JSON.stringify(label)});if(!button)throw Error('S8_BUTTON_MISSING');button.click();return true})()`,
  );

export const checkS8 = async ({
  panel,
  page,
  tabId,
  fixtureData,
  kind,
  modeOverride,
  cdpPort,
  version,
  extensionId,
  fixtureTarget,
}) => {
  const origin = `https://s1.fixture.test:${fixtureData.fixturePort}`;
  const resolver = {
    schema_version: 1,
    deployment_id: "s1-fixture",
    url: `${origin}/v1/resolve`,
    allowed_origins: [origin],
    key_ring: { s1: fixtureData.publicKey },
  };
  await evaluate(
    panel,
    `chrome.storage.local.set(${JSON.stringify({ profile_resolver: resolver })})`,
  );
  const config = {
    plugin_id: "contextpilot.openai-compatible",
    plugin_version: "1.0.0",
    label: "S8 fixture",
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
    throw new Error("S8_PROVIDER_SAVE_FAILED");
  const rejected = await send(panel, {
    kind: "AGENT_PREFERENCES_SAVE",
    payload: {
      preferences: { permission_mode: "skip_all_permission_checks" },
      acknowledgement: "권한 질문 생략",
    },
  });
  if (rejected?.ok !== false) throw new Error("S8_PANEL_MODE_CHANGE_ACCEPTED");
  const mode =
    modeOverride ??
    (kind === "case" ? "skip_all_permission_checks" : "follow_a_plan");
  await setS8Mode({ cdpPort, version, extensionId, fixtureTarget, mode });
  const prompt = JSON.stringify(
    kind === "case" ? "Archive case" : "Submit invoice",
  );
  await evaluate(
    panel,
    `(() => {document.querySelector('#mode-act').click();document.querySelector('#chat-input').value=${prompt};document.querySelector('#chat-form').requestSubmit();return true})()`,
  );
  await waitFor(() => hasCard(panel, "review"), 12_000, "S8_REVIEW_NOT_SHOWN");
  if (mode === "follow_a_plan") {
    const invalid = await send(panel, {
      kind: "PLAN_APPROVE",
      run_id: "invalid-session",
      origins: [origin],
    });
    if (invalid?.code !== "PLAN_SCOPE_VIOLATION")
      throw new Error("S8_UNBOUND_PLAN_APPROVED");
    await clickCard(panel, "review", "도메인 계획 승인");
  }
  if (
    (await evaluate(
      page,
      "document.querySelector('#target').dataset.trusted ?? ''",
    )) !== ""
  )
    throw new Error("S8_EXECUTED_BEFORE_REVIEW");
  await clickCard(panel, "review", "이번 단계 실행");
  if (kind === "invoice") {
    await waitFor(
      () => hasCard(panel, "confirmation"),
      10_000,
      "S8_R2_CONFIRMATION_MISSING",
    );
    if (
      (await evaluate(
        page,
        "document.querySelector('#target').dataset.trusted ?? ''",
      )) !== ""
    )
      throw new Error("S8_R2_EXECUTED_EARLY");
    await clickCard(panel, "confirmation", "확인하고 실행");
  }
  await waitFor(
    async () =>
      (await evaluate(
        page,
        "document.querySelector('#target').dataset.trusted",
      )) === "yes" &&
      (await evaluate(
        panel,
        "document.querySelector('#chat-messages')?.textContent.includes('S7 action complete') && document.querySelector('#chat-send')?.dataset.state === 'send'",
      )),
    20_000,
    "S8_ACTION_NOT_VERIFIED",
  );
  if (await hasCard(panel, "permission"))
    throw new Error("S8_PERMISSION_CARD_SHOWN");
  const status = await evaluate(
    page,
    "({disabled:document.querySelector('#target').disabled,result:document.querySelector('#result').textContent})",
  );
  const badge = await evaluate(
    panel,
    "document.querySelector('#permission-mode-badge')?.dataset.mode",
  );
  const attached = await evaluate(
    panel,
    `chrome.debugger.getTargets().then(items=>items.find(item=>item.tabId===${tabId})?.attached===true)`,
  );
  if (
    !status.disabled ||
    status.result !==
      (kind === "case" ? "Archived case" : "Submitted invoice") ||
    attached ||
    fixtureData.providerRequests.length !== 3 ||
    JSON.stringify(fixtureData.providerRequests).includes(
      "S7_SECRET_PASSWORD",
    ) ||
    badge !== mode
  )
    throw new Error(
      `S8_RESULT_BOUNDARY: ${JSON.stringify({ status, attached, badge, calls: fixtureData.providerRequests.length })}`,
    );
  if (mode === "follow_a_plan")
    await checkS8PlanExpiry({ panel, page, fixtureData, prompt });
  if (kind === "case")
    return checkS8Transition({
      panel,
      page,
      fixtureData,
      cdpPort,
      version,
      extensionId,
      fixtureTarget,
    });
  return { providerCalls: fixtureData.providerRequests.length };
};
