import assert from "node:assert/strict";
import { cdp, evaluate } from "./chrome-cdp-utils.mjs";
export const verifyNavigationDiagnostics = async (
  harness,
  wrongDestination,
  urlTransition = false,
) => {
  await cdp(harness.version.webSocketDebuggerUrl, "Target.activateTarget", {
    targetId: harness.fixtureTarget.targetId,
  });
  const windowId = await evaluate(
    harness.panel,
    "chrome.windows.getCurrent().then(window=>window.id)",
  );
  const response = await harness.send({
    kind: "PANEL_REQUEST",
    window_id: windowId,
    payload: { schema_version: 1, kind: "DIAGNOSTICS_BUNDLE_EXPORT" },
  });
  assert.equal(response.ok, true, JSON.stringify(response));
  const records =
    response.data.sections.execution_trace.data.method_trace.worker.records;
  const decision = (name) =>
    records.findLast(
      (record) => record.event === "method.decision" && record.method === name,
    )?.detail.data;
  const dispatch = decision("act.navigation.dispatch"),
    result = decision("act.navigation.result"),
    confirmation = decision("act.navigation.confirmation"),
    goal = decision("act.goal.feedback");
  assert.equal(typeof dispatch?.approved_url, "string");
  assert.equal(typeof result?.observed_url, "string");
  assert.ok(dispatch.approved_url.endsWith("/next"));
  assert.ok(
    result.observed_url.endsWith(
      urlTransition ? "/#pricing" : wrongDestination ? "/wrong" : "/next",
    ),
  );
  assert.equal(confirmation.accepted, !wrongDestination && !urlTransition);
  if (wrongDestination || urlTransition)
    assert.equal(confirmation.code, "DESTINATION_MISMATCH");
  assert.equal(typeof confirmation.current_url, "string");
  assert.equal(goal.goal_status, "completed");
  assert.equal(goal.reason, "PROVIDER_COMPLETED");
  assert.equal(goal.provider_completed, true);
  return {
    approved_url_visible: true,
    observed_url_visible: true,
    confirmation_url_visible: true,
    urls_differ: dispatch.approved_url !== result.observed_url,
    local_navigation_code: confirmation.code ?? null,
    provider_completed_accepted: true,
    bundle_version: response.data.extension_version,
  };
};
