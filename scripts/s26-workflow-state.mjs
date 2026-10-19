import assert from "node:assert/strict";
import { evaluate, waitFor } from "./chrome-cdp-utils.mjs";
import { capture } from "./s26-ui-capture.mjs";
export async function captureWorkflow(panel) {
  const candidate = {
    id: "s26-recorded-workflow",
    source: "recorded",
    title: "S26 recorded workflow",
    origin: "https://fixture.test",
    path_prefix: "/",
    step_count: 2,
    status: "verified",
    detail: "Controlled presentation fixture; no execution authority",
  };
  const replies = {
    CHAT_REQUEST_START: { ok: true },
    CHAT_REQUEST_STATUS: {
      ok: true,
      request: { revision: 1, state: "TERMINAL", outcome: "VERIFIED" },
      result: {
        state: "WORKFLOW_CANDIDATES",
        selection_id: "s26-selection-abcdefghijkl",
        candidates: [candidate],
      },
    },
    WORKFLOW_SELECT: { ok: true, candidate },
  };
  await evaluate(
    panel,
    `(()=>{
    const original=chrome.runtime.sendMessage.bind(chrome.runtime);
    const replies=${JSON.stringify(replies)};
    chrome.runtime.sendMessage=m=>replies[m.payload?.kind??m.kind]?Promise.resolve(replies[m.payload?.kind??m.kind]):original(m);
    document.querySelector('#chat-input').value='Show the fixture workflow';
    document.querySelector('#chat-form').requestSubmit();
    return true;
  })()`,
  );
  await waitFor(
    () =>
      evaluate(
        panel,
        "!!document.querySelector('[data-workflow-selection-id]')",
      ),
    10000,
    "S26_WORKFLOW_CANDIDATES",
  );
  await capture(panel, "workflow-candidates");
  await evaluate(
    panel,
    "document.querySelector('[data-workflow-selection-id] button.primary').click()",
  );
  await waitFor(
    () =>
      evaluate(
        panel,
        "[...document.querySelectorAll('.event-card')].some(e=>e.textContent.includes('워크플로우 계획 확인'))",
      ),
    10000,
    "S26_WORKFLOW_PREVIEW",
  );
  assert.ok(
    await evaluate(
      panel,
      "[...document.querySelectorAll('button')].some(e=>e.textContent==='분석 시작')",
    ),
  );
  await capture(panel, "workflow-preview");
}
