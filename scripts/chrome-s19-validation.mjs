import { s19Private } from "./chrome-s19-fixture.mjs";
import assert from "node:assert/strict";
import { evaluate, waitFor } from "./chrome-cdp-utils.mjs";
import { checkDiagnosticsZip } from "./chrome-diagnostics-zip-check.mjs";
export const validateS19Case = async ({
  panel,
  page,
  current,
  own,
  returned,
  consent,
  liveModel,
}) => {
  assert.equal(
    await evaluate(
      panel,
      "document.querySelector('#chat-send')?.dataset.state",
    ),
    "send",
    "request did not settle",
  );
  assert.ok(
    own.some(
      (call) =>
        call.tools.includes("describe_component") &&
        call.tools.includes("read_component_data"),
    ),
    "component schemas not offered",
  );
  assert.ok(
    own.some((call) => call.responseTools.includes("describe_component")),
    "model did not describe component",
  );
  if (current.id !== "stop")
    assert.ok(
      own.some((call) => call.responseTools.includes("read_component_data")),
      "model did not read component",
    );
  for (const call of own)
    for (const [index, id] of call.responseCallIds.entries())
      if (call.responseTools[index] !== "report_goal_status")
        assert.ok(
          returned.some((result) => result.id === id) || current.id === "stop",
          "same call ID result missing",
        );
  if (current.action) {
    assert.ok(own.some((call) => call.responseTools.includes("submit_plan")));
    assert.ok(own.some((call) => call.responseTools.includes("propose_click")));
    assert.ok(
      own.some((call) => call.responseTools.includes("report_goal_status")),
    );
    assert.ok(
      returned.some(
        (result) =>
          result.execution &&
          result.outcome === "VERIFIED" &&
          result.observed &&
          result.dispatched &&
          result.verifier === "satisfied",
      ),
      "action was not dispatched and verified",
    );
    assert.ok(
      returned.some((result) => result.action_data_observed),
      "fresh component read did not contain changed page data",
    );
    const goal = own.flatMap((call) => call.goalStatus ?? []).at(-1);
    assert.ok(
      ["completed", "incomplete"].includes(goal),
      "model did not return a confirmed or explicitly partial goal assessment",
    );
    const counts = await s19FeedbackCounts(panel);
    const index = goal === "completed" ? 0 : 1;
    assert.ok(
      counts[index] > current.feedbackBefore[index],
      "fresh goal assessment was not displayed with its actual status",
    );
    assert.equal(
      await evaluate(
        page,
        current.kind === "tree"
          ? "document.querySelector('[role=treeitem]').getAttribute('aria-expanded')"
          : "document.querySelector('tbody td').textContent",
      ),
      current.kind === "tree" ? "true" : "Following page",
    );
  }
  const reads = returned.filter((item) => item.coverage && item.channel);
  if (current.id === "table") {
    assert.ok(reads.length >= (liveModel ? 1 : 3), "continuation missing");
    assert.equal(
      reads.reduce((n, r) => n + r.coverage.supplied_count, 0),
      8,
    );
  }
  if (current.id === "scroll") {
    assert.equal(consent, true);
    assert.ok(
      reads.some(
        (read) =>
          read.restored === true && read.coverage.collected_count === 40,
      ),
    );
    assert.equal(
      await evaluate(page, "document.getElementById('virtual').scrollTop"),
      0,
    );
  }
  if (current.id === "alternative")
    assert.ok(reads.some((read) => read.channel === "alt_table"));
  if (current.id.endsWith("unsupported"))
    assert.ok(returned.some((read) => read.status === "UNSUPPORTED"));
  if (current.id === "alternative-missing")
    assert.ok(returned.some((read) => read.status === "UNSUPPORTED"));
  if (current.id.includes("deny"))
    assert.ok(returned.some((read) => read.status === "DENIED"));
  if (current.id === "stale")
    assert.ok(returned.some((read) => read.status === "STALE"));
  if (current.id === "vision-sensitive")
    assert.ok(returned.some((read) => read.status === "UNSUPPORTED"));
  if (current.id === "vision")
    assert.ok(
      own.some((call) => call.images > 0),
      "typed image missing",
    );
  if (current.kind === "tree" || current.kind === "canvas")
    assert.ok(reads.every((read) => read.coverage.complete === false));
  const zipStart = await evaluate(panel, "window.__downloads.length");
  await evaluate(
    panel,
    `document.querySelector('#diagnostics-export').click()`,
  );
  const bytes = await waitFor(
    () => evaluate(panel, `window.__downloads[${zipStart}]`),
    10000,
    "ZIP_MISSING",
  );
  const zip = checkDiagnosticsZip(bytes);
  assert.equal(
    !current.action && JSON.stringify(zip).includes("Hidden descendant"),
    false,
    "hidden data in diagnostics",
  );
  assert.equal(
    JSON.stringify(zip).includes(s19Private),
    false,
    "sensitive component data in ZIP",
  );
  return { entries: Object.keys(zip).length };
};

export const s19FeedbackCounts = (panel) =>
  evaluate(
    panel,
    "['모델이 목표 완료','목표에 남은 작업','목표 완료로 처리하지 않습니다'].map(text=>document.querySelector('#chat-messages').textContent.split(text).length-1)",
  );
export const s19HasFinalFeedback = async (panel, current, own) => {
  if (!current.action) return true;
  const status = own.flatMap((call) => call.goalStatus ?? []).at(-1);
  if (!status) return false;
  const index = status === "completed" ? 0 : status === "incomplete" ? 1 : 2;
  return (
    (await s19FeedbackCounts(panel))[index] > current.feedbackBefore[index]
  );
};
