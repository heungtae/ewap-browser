import { qualifyWorkflowCases } from "./chrome-panel-workflow.mjs";
import assert from "node:assert/strict";
import { cdp, evaluate, waitFor } from "../chrome-cdp-utils.mjs";
import { capturePanel } from "./chrome-panel-capture.mjs";
export async function qualifyPanelCases(panel, output) {
  const cases = [];
  const fixture = "window.__s28PanelFixture";
  const runId = "s28-presentation-run",
    requestId = "s28-presentation-request";
  let revision = 0;
  const prompt = () => ({
    id: `prompt-${++revision}`,
    revision,
    requestId,
    documentId: "fixture-document",
    expiresAt: Date.now() + 60000,
  });
  const emit = async (type, fields = {}) => {
    const sequence = await evaluate(
      panel,
      `${fixture}.emit(${JSON.stringify({ runId, requestId, type, ...fields })})`,
    );
    assert.ok(Number.isInteger(sequence), `EMIT_${type}`);
    await evaluate(panel, `${fixture}.tick();true`);
    await waitFor(
      () => evaluate(panel, `${fixture}.state().cursor===${sequence}`),
      3000,
      `PANEL_EVENT_${type}`,
    );
  };
  const capture = async (name) =>
    cases.push(await capturePanel(panel, output, name));
  await capture("panel-idle");
  await emit("run_started", { mode: "act", permission_mode: "custom" });
  const action = {
    tool: "click_by_ref",
    target_name: "Fixture Save",
    approval_scope: "single_step",
  };
  await emit("action_review_required", { action, prompt: prompt() });
  await capture("panel-action-review");
  await evaluate(
    panel,
    "[...document.querySelectorAll('.event-card[data-kind=review] button.primary')].at(-1).focus();true",
  );
  for (const type of ["keyDown", "keyUp"])
    await cdp(panel.webSocketDebuggerUrl, "Input.dispatchKeyEvent", {
      type,
      key: "Tab",
      code: "Tab",
      windowsVirtualKeyCode: 9,
    });
  assert.equal(
    await evaluate(panel, "document.activeElement.textContent"),
    "중단",
  );

  await emit("action_review_required", {
    action: {
      ...action,
      approval_scope: "session",
      suggested_value: "fixture proposed value",
    },
    prompt: prompt(),
  });
  await capture("panel-session-review");
  await emit("permission_required", {
    action,
    capability: "click",
    host: "fixture.test",
    prompt: prompt(),
  });
  await capture("panel-permission");
  await emit("value_required", {
    action,
    value_kind: "text",
    prompt: prompt(),
  });
  assert.equal(
    await evaluate(
      panel,
      "document.activeElement===document.querySelector('.event-card[data-kind=value] input')",
    ),
    true,
  );
  await capture("panel-value");
  await evaluate(
    panel,
    "document.querySelector('.event-card[data-kind=value] input').value='fixture-only-value';true",
  );
  await emit("confirmation_required", {
    action,
    confirmation_id: "fixture-confirm",
    confirmation_nonce: "fixture-nonce",
    prompt: prompt(),
  });
  assert.equal(
    await evaluate(
      panel,
      "document.querySelector('.event-card[data-kind=value] input').value",
    ),
    "",
  );
  await capture("panel-confirmation");
  await emit("value_required", {
    action,
    value_kind: "option",
    prompt: prompt(),
  });
  await capture("panel-option-value");
  for (const purpose of [
    "source",
    "component-scroll",
    "component-vision",
    "runtime-methods",
    "jev-decision",
    "runtime-result",
  ]) {
    await emit("source_consent_required", {
      prompt: prompt(),
      purpose,
      resource_count: 1,
      host: "fixture.test",
    });
    await capture(`panel-consent-${purpose}`);
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
    prompt: prompt(),
  });
  await capture("workflow-plan-review");
  await evaluate(panel, "document.querySelector('#chat-send').click();true");
  assert.equal(
    await evaluate(
      panel,
      "document.querySelector('#chat-send').getAttribute('aria-label')",
    ),
    "중단 중",
  );
  await capture("panel-stopping");
  await emit("run_terminal", { outcome: "UNKNOWN", code: "GOAL_UNVERIFIED" });
  await capture("panel-goal-unknown");
  await evaluate(
    panel,
    "document.querySelector('#new-chat-open').focus();document.querySelector('#new-chat-open').click();true",
  );
  assert.equal(
    await evaluate(
      panel,
      "document.querySelector('#new-chat-dialog').contains(document.activeElement)",
    ),
    true,
  );
  await capture("new-chat-dialog");
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
  assert.equal(
    await evaluate(panel, "document.activeElement.id"),
    "new-chat-open",
  );
  await qualifyWorkflowCases(panel, { fixture, prompt, capture });
  return {
    cases,
    result: "PASS",
    scope:
      "TaskClient fixture presentation; geometry differences retained for review; not full S26 parity or native task routing",
  };
}
