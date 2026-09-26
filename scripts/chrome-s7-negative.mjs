import { evaluate, waitFor } from "./chrome-cdp-utils.mjs";

export const checkS7Negative = async ({
  panel,
  page,
  tabId,
  fixtureData,
  kind,
}) => {
  const origin = `https://s1.fixture.test:${fixtureData.fixturePort}`;
  if (kind === "tampered") {
    fixtureData.setInvalidSignature(true);
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
  }
  const config = {
    plugin_id: "contextpilot.openai-compatible",
    plugin_version: "1.0.0",
    label: "S7 fixture",
    base_url: `${origin}/v1`,
    wire_api: "chat_completions",
    model: "fixture-model",
    api_key: "",
    api_key_header: "none",
    headers: [],
    timeout_ms: 30_000,
    enabled: true,
  };
  const saved = await evaluate(
    panel,
    `chrome.runtime.sendMessage(${JSON.stringify({ kind: "PROVIDER_SAVE", payload: { id: "fixture", config } })})`,
  );
  if (saved?.ok !== true) throw new Error("S7_PROVIDER_SAVE_FAILED");
  await evaluate(
    panel,
    "(() => {document.querySelector('#mode-act').click();document.querySelector('#chat-input').value='Archive case';document.querySelector('#chat-form').requestSubmit();return true})()",
  );
  if (kind === "unverifiable") {
    await waitFor(
      () =>
        evaluate(
          panel,
          "document.querySelector('.event-card[data-kind=review]') !== null",
        ),
      12_000,
      "S7_UNVERIFIABLE_REVIEW_MISSING",
    );
    await evaluate(
      panel,
      "[...document.querySelectorAll('.event-card[data-kind=review]')].at(-1).querySelector('button.primary').click()",
    );
    await waitFor(
      () =>
        evaluate(
          panel,
          "document.querySelector('.event-card[data-kind=permission]') !== null",
        ),
      10_000,
      "S7_UNVERIFIABLE_PERMISSION_MISSING",
    );
    await evaluate(
      panel,
      "[...document.querySelectorAll('.event-card[data-kind=permission]')].at(-1).querySelector('button.primary').click()",
    );
  }
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('.event-card[data-kind=error]') !== null && document.querySelector('#chat-send')?.dataset.state === 'send'",
      ),
    12_000,
    `S7_${kind.toUpperCase()}_NOT_REJECTED`,
  );
  const state = await evaluate(
    page,
    "({trusted:document.querySelector('#target').dataset.trusted ?? '',disabled:document.querySelector('#target').disabled,result:document.querySelector('#result').textContent})",
  );
  const attached = await evaluate(
    panel,
    `chrome.debugger.getTargets().then(items=>items.find(item=>item.tabId===${tabId})?.attached===true)`,
  );
  const calls = fixtureData.providerRequests.length;
  if (
    state.trusted ||
    state.disabled ||
    state.result !== "Open case" ||
    attached ||
    calls !== (kind === "tampered" ? 1 : 2)
  )
    throw new Error(
      `S7_${kind.toUpperCase()}_BOUNDARY_FAILED: ${JSON.stringify({ state, attached, calls })}`,
    );
  return { providerCalls: calls };
};
