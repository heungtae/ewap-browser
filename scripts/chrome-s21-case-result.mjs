import assert from "node:assert/strict";
import { evaluate } from "./chrome-cdp-utils.mjs";
import { countS22ApprovalCards } from "./chrome-s22-settings.mjs";
import {
  verifyS21Ui,
  s21Completion,
  verifyS21Result,
} from "./chrome-s21-ui.mjs";
export const finishS21Case = async ({ harness, recent, id, model }) => {
  const mutationCount = await evaluate(harness.page, "window.clicks");
  const checked = await evaluate(
    harness.page,
    "document.getElementById('option').getAttribute('aria-checked') ?? String(document.getElementById('option').checked)",
  );
  const assessmentCalls = recent.filter((c) =>
    c.tools.some((t) => t.name === "assess_action_result"),
  ).length;
  const elementCalls = recent.filter((c) =>
    c.tools.some((t) => t.name === "assess_element"),
  ).length;
  const finalGoal = recent
    .flatMap((c) => c.response)
    .findLast((c) => c.name === "report_goal_status")?.goal;
  if (id.startsWith("generic-")) {
    const receipt = recent
      .flatMap((call) => call.returned)
      .find((result) => result.execution);
    assert.equal(receipt?.dispatched, true);
    assert.equal(receipt?.outcome, "UNKNOWN");
    assert.equal(receipt?.code, "POSTCONDITION_UNVERIFIED");
  }
  const accepted = await s21Completion(harness);
  verifyS21Result({
    id,
    model,
    elementCalls,
    mutationCount,
    assessmentCalls,
    finalGoal,
    checked,
    accepted,
  });
  const text = await evaluate(
    harness.panel,
    "document.querySelector('#status').textContent",
  );
  if (finalGoal === "completed")
    assert.ok(
      text.includes("목표의 완료를 확인"),
      `Current completion UI: ${text}`,
    );
  else assert.ok(!text.includes("목표의 완료를 확인"));
  const visibleCompletion = await verifyS21Ui(harness, finalGoal);
  const approvalCards = process.env.S22_MODE
    ? await countS22ApprovalCards(harness.panel)
    : undefined;
  if (process.env.S22_MODE === "full")
    assert.equal(approvalCards, 0, "Full Permission showed an approval card");
  return {
    id,
    approvalCards,
    pass: true,
    mutationCount,
    checked,
    assessmentCalls,
    elementCalls,
    finalGoal,
    completionUi: text,
    visibleCompletion,
    accepted,

    calls: recent,
  };
};
