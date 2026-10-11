import assert from "node:assert/strict";

// Controlled regression: render the destination while the first model goal
// report is pending. The second report must consume the newly supplied page.
export const delayGoalRender = async (
  body,
  current,
  reply,
  page,
  evaluate,
  sleep,
  record,
) => {
  if (current.id !== "delayed-cost-screen") return;
  const call = reply.tool_calls.find(
    (item) => item.function.name === "report_goal_status",
  );
  if (!call) return;
  const args = JSON.parse(call.function.arguments);
  current.goalReports = (current.goalReports ?? 0) + 1;
  if (current.goalReports === 1) {
    args.status = "incomplete";
    args.summary = "Destination shell is visible; pricing has not rendered.";
    await evaluate(
      page,
      "(()=>{const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','Pricing');dialog.textContent='Pricing plans: Basic $10, Pro $20';dialog.style.cssText='position:fixed;top:0;left:0;z-index:99999;background:white';document.body.prepend(dialog);return true})()",
    );
    await sleep(250);
  } else {
    assert.ok(
      body.messages.some(
        (message) =>
          message.content?.startsWith("[UNTRUSTED_PAGE_PROJECTION]") &&
          message.content.includes("Pricing plans"),
      ),
    );
    assert.deepEqual(
      body.tools.map((tool) => tool.function.name),
      ["report_goal_status"],
    );
    assert.ok(
      body.messages.some(
        (message) =>
          message.role === "tool" &&
          message.content.includes("OBSERVATION_CHANGED"),
      ),
    );
  }
  call.function.arguments = JSON.stringify(args);
  record.goalStatus = args.status;
  record.observationId = args.observation_id;
};
export const verifyDelayedGoal = (current, result) => {
  if (current.id !== "delayed-cost-screen") return;
  const reports = result.calls.filter((call) => call.goalStatus);
  assert.deepEqual(
    reports.map((call) => call.goalStatus),
    ["incomplete", "completed"],
  );
  assert.equal(new Set(reports.map((call) => call.observationId)).size, 2);
  const final = result.eventSummary.filter(
    (event) => event.completion?.goal_status === "completed",
  );
  assert.equal(final.length, 1);
  assert.equal(final[0].completion.action_outcome, "VERIFIED");
  assert.equal(final[0].completion.reassessments, 1);
  assert.equal(
    result.eventSummary.filter(
      (event) => event.type === "tool_finished" && event.outcome === "VERIFIED",
    ).length,
    1,
  );
  assert.ok(
    !result.eventSummary.some((event) => event.code === "INTERNAL_FAILURE"),
  );
};
