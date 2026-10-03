import assert from "node:assert/strict";
import { cdp, evaluate, waitFor, sleep } from "./chrome-cdp-utils.mjs";

export const createS13AnalysisHarness = async ({
  panel,
  panelWindowId,
  page,
  version,
  cdpPort,
  worker,
  providerRequests,
  control,
  fixturePort,
}) => {
  await evaluate(
    panel,
    `chrome.storage.local.set({provider_settings:{schema_version:1,providers:{fixture:{plugin_id:'contextpilot.openai-compatible',plugin_version:'1.0.0',label:'fixture',base_url:'https://analysis.fixture.test:${fixturePort}/v1',wire_api:'chat_completions',model:'fixture',api_key:'',api_key_header:'none',headers:[],timeout_ms:120000,enabled:true}},active_provider:'fixture'}})`,
  );
  const send = (payload) =>
    evaluate(
      panel,
      `chrome.runtime.sendMessage(${JSON.stringify({ kind: "PANEL_REQUEST", window_id: panelWindowId, payload })})`,
    );
  await evaluate(
    panel,
    `(() => {const original=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=(message,...args)=>{if(message.payload?.kind==='CHAT_REQUEST_START')window.s13RequestId=message.payload.request_id;return original(message,...args);};return true;})()`,
  );
  const status = async () => {
    const result = await send({
      schema_version: 1,
      kind: "CHAT_REQUEST_STATUS",
      request_id: await evaluate(panel, "s13RequestId"),
    });
    return result.request ?? result;
  };
  const terminal = () =>
    waitFor(
      async () => {
        const result = await status();
        return result.state === "TERMINAL" ? result : undefined;
      },
      20000,
      "S13 request did not settle",
    );
  const hasButton = (label) =>
    evaluate(
      panel,
      `[...document.querySelectorAll('#chat-messages button')].some(item=>!item.disabled && item.textContent?.includes(${JSON.stringify(label)}))`,
    );
  const click = (label) =>
    evaluate(
      panel,
      `(()=>{const button=[...document.querySelectorAll('#chat-messages button')].reverse().find(item=>!item.disabled && item.textContent?.includes(${JSON.stringify(label)}));if(!button)return false;button.click();return true;})()`,
    );
  const navigate = async (path, api = false) => {
    await cdp(page.webSocketDebuggerUrl, "Page.navigate", {
      url: api
        ? `https://page-api-fixture.invalid${path}`
        : `https://analysis.fixture.test:${fixturePort}${path}`,
    });
    await waitFor(
      () =>
        evaluate(
          page,
          `location.pathname===${JSON.stringify(path.split("?")[0])} && document.readyState==='complete'`,
        ),
      10000,
      "S13 fixture did not load",
    );
    await sleep(150);
  };
  const submit = async (mode, prompt = "이 페이지 데이터를 분석 요약해") => {
    await waitFor(
      () =>
        evaluate(
          panel,
          "document.querySelector('#chat-send')?.dataset.state === 'send'",
        ),
      10000,
      "S13 Panel did not return to send state",
    );
    await evaluate(
      panel,
      `(()=>{document.querySelector('#mode-${mode}').click();document.querySelector('#chat-input').value=${JSON.stringify(prompt)};document.querySelector('#chat-form').requestSubmit();return true;})()`,
    );
    await sleep(100);
  };
  const block = (request) =>
    request.messages
      ?.map((message) => message.content)
      .find(
        (content) =>
          typeof content === "string" &&
          content.includes("[UNTRUSTED_ANALYSIS_DATA]"),
      )
      ?.match(
        /\[UNTRUSTED_ANALYSIS_DATA\]\s*([\s\S]*?)\s*\[\/UNTRUSTED_ANALYSIS_DATA\]/,
      )?.[1];
  const contexts = () =>
    providerRequests.map(block).filter(Boolean).map(JSON.parse);
  const approve = async () => {
    await waitFor(
      () => hasButton("이번 요청에서 허용"),
      10000,
      "S13 read permission absent",
    );
    assert.equal(await click("이번 요청에서 허용"), true);
  };
  const checkContext = (context, expected) => {
    for (const [key, value] of Object.entries(expected))
      assert.deepEqual(context[key], value, JSON.stringify(context));
    const text = JSON.stringify(context);
    for (const value of [
      "adapter_id",
      "document_id",
      "container_xpath",
      "collection_ref",
      "row_id",
      "cursor",
      "function",
      "endpoint",
      "S13_SECRET_TOKEN",
    ])
      assert.equal(text.includes(value), false, `leaked ${value}`);
  };

  return {
    send,
    status,
    terminal,
    hasButton,
    click,
    navigate,
    submit,
    contexts,
    approve,
    checkContext,
    panel,
    page,
    worker,
    version,
    cdpPort,
    providerRequests,
    control,
  };
};
