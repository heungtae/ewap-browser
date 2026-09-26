import { evaluate, waitFor } from "./chrome-cdp-utils.mjs";

const send = (panel, message) =>
  evaluate(panel, `chrome.runtime.sendMessage(${JSON.stringify(message)})`);
const card = (panel, kind) =>
  evaluate(
    panel,
    `document.querySelector('.event-card[data-kind="${kind}"]') !== null`,
  );
const clickCard = (panel, kind, label) =>
  evaluate(
    panel,
    `(() => {const item=[...document.querySelectorAll('.event-card[data-kind="${kind}"]')].at(-1);const button=[...item.querySelectorAll('button')].find(button=>button.textContent===${JSON.stringify(label)});if(!button)throw Error('S7_CARD_BUTTON_MISSING');button.click();return true})()`,
  );

export const checkS7 = async ({ panel, page, tabId, fixtureData, kind }) => {
  const origin = `https://s1.fixture.test:${fixtureData.fixturePort}`;
  if (kind !== "note")
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
  if (
    (
      await send(panel, {
        kind: "PROVIDER_SAVE",
        payload: { id: "fixture", config },
      })
    )?.ok !== true
  )
    throw new Error("S7_PROVIDER_SAVE_FAILED");
  await evaluate(
    panel,
    `(() => {document.querySelector('#mode-act').click();document.querySelector('#chat-input').value=${JSON.stringify(kind === "invoice" ? "Submit invoice" : kind === "note" ? "Set public note" : "Archive case")};document.querySelector('#chat-form').requestSubmit();return true})()`,
  );
  await waitFor(() => card(panel, "review"), 12_000, "S7_REVIEW_NOT_SHOWN");
  const requests = fixtureData.providerRequests;
  if (requests.length !== 2 || requests[0].tools?.length)
    throw new Error("S7_CLASSIFIER_AUTHORITY");
  const toolNames = requests[1].tools?.map((tool) => tool.function.name) ?? [];
  if (
    !toolNames.includes(
      kind === "note" ? "propose_set_text" : "propose_click",
    ) ||
    (kind === "invoice" && toolNames.some((name) => name !== "propose_click"))
  )
    throw new Error("S7_ACTION_TOOL_AUTHORITY");
  const target = kind === "note" ? "#note" : "#target";
  if (
    (await evaluate(
      page,
      `document.querySelector('${target}').dataset.trusted ?? ''`,
    )) !== ""
  )
    throw new Error("S7_EXECUTED_BEFORE_REVIEW");
  await clickCard(panel, "review", "이번 단계 실행");
  await waitFor(
    () => card(panel, "permission"),
    10_000,
    "S7_PERMISSION_NOT_SHOWN",
  );
  if (
    (await evaluate(
      page,
      `document.querySelector('${target}').dataset.trusted ?? ''`,
    )) !== ""
  )
    throw new Error("S7_EXECUTED_BEFORE_PERMISSION");
  await clickCard(panel, "permission", "이번만 허용");
  if (kind === "note") {
    await waitFor(() => card(panel, "value"), 10_000, "S7_VALUE_NOT_SHOWN");
    if (
      (await evaluate(page, "document.querySelector('#note').value")) !==
      "Draft"
    )
      throw new Error("S7_TEXT_APPLIED_BEFORE_VALUE");
    await evaluate(
      panel,
      "(() => {const form=[...document.querySelectorAll('.event-card[data-kind=value] form')].at(-1);form.querySelector('input').value='Reviewed note';form.requestSubmit();return true})()",
    );
  }
  if (kind === "invoice") {
    try {
      await waitFor(
        () => card(panel, "confirmation"),
        10_000,
        "S7_R2_CONFIRMATION_NOT_SHOWN",
      );
    } catch (error) {
      const state = await evaluate(
        page,
        "({trusted:document.querySelector('#target').dataset.trusted,disabled:document.querySelector('#target').disabled})",
      );
      const ui = await evaluate(
        panel,
        "({send:document.querySelector('#chat-send')?.dataset.state,cards:[...document.querySelectorAll('.event-card')].map(item=>({kind:item.dataset.kind,title:item.querySelector('b')?.textContent,detail:item.dataset.kind==='error'?item.querySelector('.event-detail')?.textContent:undefined})).slice(-8)})",
      );
      throw new Error(
        `${error.message}: ${JSON.stringify({ state, ui, calls: requests.length })}`,
      );
    }
    if (
      (await evaluate(
        page,
        "document.querySelector('#target').dataset.trusted ?? ''",
      )) !== ""
    )
      throw new Error("S7_R2_EXECUTED_BEFORE_CONFIRMATION");
    await clickCard(panel, "confirmation", "확인하고 실행");
  }
  try {
    await waitFor(
      async () =>
        (await evaluate(
          page,
          `document.querySelector('${target}').dataset.trusted`,
        )) === "yes" &&
        (await evaluate(
          panel,
          "document.querySelector('#chat-messages')?.textContent.includes('S7 action complete') && document.querySelector('#chat-send')?.dataset.state === 'send'",
        )),
      20_000,
      "S7_ACTION_NOT_VERIFIED",
    );
  } catch (error) {
    const state = await evaluate(
      page,
      `({trusted:document.querySelector('${target}').dataset.trusted,disabled:document.querySelector('${target}').disabled,value:document.querySelector('${target}').value})`,
    );
    const ui = await evaluate(
      panel,
      "({send:document.querySelector('#chat-send')?.dataset.state,cards:[...document.querySelectorAll('.event-card')].map(item=>({kind:item.dataset.kind,title:item.querySelector('b')?.textContent,state:item.querySelector('.tool-state')?.textContent,detail:item.dataset.kind==='error'?item.querySelector('.event-detail')?.textContent:undefined})).slice(-8)})",
    );
    throw new Error(
      `${error.message}: ${JSON.stringify({ state, ui, calls: requests.length })}`,
    );
  }
  const state = await evaluate(
    page,
    kind === "note"
      ? "({value:document.querySelector('#note').value})"
      : "({disabled:document.querySelector('#target').disabled,result:document.querySelector('#result').textContent})",
  );
  if (
    (kind === "note" && state.value !== "Reviewed note") ||
    (kind !== "note" &&
      (!state.disabled ||
        state.result !==
          (kind === "invoice" ? "Submitted invoice" : "Archived case")))
  )
    throw new Error("S7_POSTCONDITION_MISMATCH");
  const attached = await evaluate(
    panel,
    `chrome.debugger.getTargets().then(items=>items.find(item=>item.tabId===${tabId})?.attached===true)`,
  );
  if (
    attached ||
    requests.length !== 3 ||
    JSON.stringify(requests).includes("S7_SECRET_PASSWORD")
  )
    throw new Error("S7_DETACH_OR_SECRET_BOUNDARY");
  if (kind === "note") {
    const storage = await evaluate(
      panel,
      "Promise.all([chrome.storage.local.get(null),chrome.storage.session.get(null)]).then(JSON.stringify)",
    );
    if (
      JSON.stringify(requests).includes("Reviewed note") ||
      storage.includes("Reviewed note")
    )
      throw new Error("S7_VALUE_EXPOSED_TO_PROVIDER_OR_STORAGE");
  }
  return { providerCalls: requests.length, profile: kind !== "note" };
};
