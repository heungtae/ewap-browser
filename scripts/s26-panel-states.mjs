import assert from "node:assert/strict";
import { captureWorkflow } from "./s26-workflow-state.mjs";
import { capture } from "./s26-ui-capture.mjs";
import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";
export async function capturePanelStates(panel) {
  // Keep the preload's CDP session alive until reload and capture complete.
  const socket = new WebSocket(panel.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let sequence = 0;
  const command = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const receive = ({ data }) => {
        const response = JSON.parse(data);
        if (response.id !== id) return;
        socket.removeEventListener("message", receive);
        if (response.error) reject(new Error(response.error.message));
        else resolve(response.result);
      };
      socket.addEventListener("message", receive);
      socket.send(JSON.stringify({ id, method, params }));
    });
  await command("Page.enable");
  const script = await command("Page.addScriptToEvaluateOnNewDocument", {
    source: `(()=>{
    const send=chrome.runtime.sendMessage.bind(chrome.runtime);
    const connect=chrome.runtime.connect.bind(chrome.runtime);
    window.__s26={};
    chrome.runtime.sendMessage=m=>(m.kind==='CANCEL'||m.payload?.kind==='CANCEL')?new Promise(()=>{}):['CHAT_RECOVER','CHAT_RESYNC'].includes(m.kind)?Promise.resolve({ok:true,tab_id:1,events:[]}):['PANEL_REQUEST','CANCEL'].includes(m.kind)?Promise.resolve({ok:true}):send(m);
    chrome.runtime.connect=info=>info.name==='contextpilot-panel'?{postMessage(){},disconnect(){},onMessage:{addListener(fn){window.__s26.receive=fn}},onDisconnect:{addListener(){}}}:connect(info);
  })()`,
  });
  try {
    await command("Page.reload");
    await waitFor(
      () =>
        evaluate(
          panel,
          "!!window.__s26?.receive && !!document.querySelector('#chat-send')",
        ),
      10000,
      "S26_EVENT_SEAM_READY",
    );
    let eventSequence = 0;
    const runId = "s26-presentation-abcdefghijkl";
    const emit = (type, fields = {}) =>
      evaluate(
        panel,
        `window.__s26.receive(${JSON.stringify({ kind: "CHAT_EVENT", event: { session_id: "session-abcdefghijklmnop", thread_id: "thread-abcdefghijklmnop", tab_id: 1, run_id: runId, sequence: ++eventSequence, type, ...fields } })})`,
      );
    const action = {
      session_id: "session-abcdefghijklmnop",
      proposal_id: "proposal-abcdefghijkl",
      tool: "click_by_ref",
      target_name: "Fixture Save",
      approval_scope: "single_step",
    };
    await emit("run_started", { mode: "act", permission_mode: "standard" });
    await emit("action_review_required", { action });
    assert.ok(
      await evaluate(
        panel,
        "document.querySelector('.event-card[data-kind=review] button.primary')!==null",
      ),
    );
    await capture(panel, "panel-action-review");
    await emit("action_review_required", {
      action: {
        ...action,
        approval_scope: "session",
        suggested_value: "fixture proposed value",
      },
    });
    await capture(panel, "panel-session-review");
    await emit("permission_required", {
      action,
      request_id: "permission-abcdefghijkl",
      capability: "click",
      host: "fixture.test",
    });
    await capture(panel, "panel-permission");
    await emit("value_required", { action, value_kind: "text" });
    await capture(panel, "panel-value");
    await evaluate(
      panel,
      "document.querySelector('.event-card[data-kind=value] input').value='fixture-only-value'",
    );
    await emit("confirmation_required", {
      action,
      confirmation_id: "confirm-abcdefghijkl",
      confirmation_nonce: "nonce-abcdefghijkl",
    });
    assert.equal(
      await evaluate(
        panel,
        "document.querySelector('.event-card[data-kind=value] input').value",
      ),
      "",
    );
    await capture(panel, "panel-confirmation");
    await emit("value_required", { action, value_kind: "option" });
    await capture(panel, "panel-option-value");
    for (const purpose of [
      "source",
      "component-scroll",
      "component-vision",
      "runtime-methods",
      "jev-decision",
      "runtime-result",
    ]) {
      await emit("source_consent_required", {
        request_id: `consent-${purpose}-abcdefghijkl`,
        resource_count: 1,
        host: "fixture.test",
        purpose,
      });
      assert.ok(
        await evaluate(
          panel,
          "document.querySelectorAll('.event-card[data-kind=permission]').length>0",
        ),
      );
      await capture(panel, `panel-consent-${purpose}`);
    }
    await emit("action_review_required", {
      action: {
        ...action,
        tool: "submit_plan",
        target_name: "Fixture workflow",
        workflow_title: "Fixture workflow",
        workflow_step: 1,
        workflow_total: 2,
      },
    });
    await capture(panel, "workflow-plan-review");
    await evaluate(panel, "document.querySelector('#chat-send').click()");
    assert.equal(
      await evaluate(
        panel,
        "document.querySelector('#chat-send').getAttribute('aria-label')",
      ),
      "중단 중",
    );
    await capture(panel, "panel-stopping");
    await emit("run_terminal", { outcome: "UNKNOWN", code: "GOAL_UNVERIFIED" });
    await capture(panel, "panel-goal-unknown");
    await evaluate(panel, "document.querySelector('#new-chat-open').click()");
    assert.ok(
      await evaluate(
        panel,
        "document.querySelector('#new-chat-dialog').contains(document.activeElement)",
      ),
    );
    await capture(panel, "new-chat-dialog");
    for (const type of ["keyDown", "keyUp"])
      await cdp(panel.webSocketDebuggerUrl, "Input.dispatchKeyEvent", {
        type,
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
    assert.equal(
      await evaluate(panel, "document.querySelector('#new-chat-dialog').open"),
      false,
    );
    await captureWorkflow(panel);
  } finally {
    await command("Page.removeScriptToEvaluateOnNewDocument", {
      identifier: script.identifier,
    });
    socket.close();
  }
}
