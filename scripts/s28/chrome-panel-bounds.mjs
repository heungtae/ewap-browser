import assert from "node:assert/strict";
import { evaluate, waitFor } from "../chrome-cdp-utils.mjs";
export async function qualifyPanelBounds(panel, h) {
  const { fixture, emit } = h;
  await emit(
    "run_started",
    { mode: "act", permission_mode: "standard" },
    "stream-run",
    "stream-request",
  );
  await emit(
    "assistant_delta",
    { text: "First " },
    "stream-run",
    "stream-request",
  );
  await evaluate(panel, `${fixture}.remount();true`);
  await waitFor(
    () =>
      evaluate(
        panel,
        `${fixture}.state().afterSequence===${fixture}.state().cursor`,
      ),
    3000,
    "REMOUNT_RESUMED",
  );
  await emit(
    "assistant_delta",
    { text: "second" },
    "stream-run",
    "stream-request",
  );
  assert.equal(
    await evaluate(
      panel,
      "[...document.querySelectorAll('.message[data-role=assistant]')].filter(e=>e.textContent==='First second').length",
    ),
    1,
  );
  await emit(
    "assistant_delta",
    { text: "X".repeat(16000) },
    "stream-run",
    "stream-request",
  );
  assert.equal(
    await evaluate(
      panel,
      "[...document.querySelectorAll('.message[data-role=assistant]')].at(-1).textContent.includes('[응답이 길어 앞부분만 표시합니다.]')",
    ),
    true,
  );
  await emit(
    "assistant_delta",
    { text: "MUST_NOT_APPEND" },
    "stream-run",
    "stream-request",
  );
  assert.equal(
    await evaluate(
      panel,
      "document.body.textContent.includes('MUST_NOT_APPEND')",
    ),
    false,
  );
  const capped = await evaluate(
    panel,
    `(()=>{for(let i=0;i<1005;i++)${fixture}.emit({runId:'stream-run',requestId:'stream-request',type:'message',role:'assistant',text:'bounded fixture '+i});${fixture}.tick();return true})()`,
  );
  assert.equal(capped, true);
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('#chat-messages').children.length===1000",
      ),
    5000,
    "TRANSCRIPT_CAP",
  );
  await evaluate(
    panel,
    "document.querySelector('#new-chat-open').click();document.querySelector('#new-chat-confirm').click();true",
  );
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('#chat-messages').children.length===0 && !document.querySelector('#empty-state').hidden",
      ),
    3000,
    "CLEAR_ACKNOWLEDGED",
  );
  await evaluate(
    panel,
    "document.querySelector('#chat-input').value='Controlled request';document.querySelector('#chat-form').requestSubmit();true",
  );
  await waitFor(
    () => evaluate(panel, `${fixture}.starts().length===1`),
    3000,
    "CLIENT_START",
  );
  const start = await evaluate(panel, `${fixture}.starts()[0]`);
  assert.equal(start.mode, "ask");
  assert.equal(start.text, "Controlled request");
  assert.match(start.requestId, /^[a-f0-9-]{36}$/);
}
