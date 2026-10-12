import assert from "node:assert/strict";
import { checkDiagnosticsZip } from "./chrome-diagnostics-zip-check.mjs";
import { evaluate, waitFor } from "./chrome-cdp-utils.mjs";
import { countS22ApprovalCards } from "./chrome-s22-settings.mjs";
export const checkS23Result = async ({
  config,
  calls,
  harness,
  results,
  started,
  interrupted,
}) => {
  const { caseName, blocked, model, live, variant } = config;
  if (variant === "secret") {
    await evaluate(
      harness.panel,
      "document.querySelector('#diagnostics-export').click()",
    );
    const bytes = await waitFor(
      () => evaluate(harness.panel, "window.__downloads.at(-1)??null"),
      10000,
      "S23_DIAGNOSTICS_ZIP",
    );
    const zip = checkDiagnosticsZip(bytes);
    const text = JSON.stringify(zip);
    assert.equal(
      text.includes(config.fixtureSecret),
      false,
      "Private return value reached diagnostics ZIP",
    );
    assert.equal(
      text.includes("__contextPilotMethods_"),
      false,
      "Registry locator reached diagnostics ZIP",
    );
  }
  if (variant === "ui")
    assert.equal(
      await evaluate(
        harness.page,
        "document.querySelector('#sum-result').textContent",
      ),
      "7",
    );
  const approvalCards = await countS22ApprovalCards(harness.panel);
  if (caseName === "ask") assert.ok(approvalCards > 0);
  else
    assert.equal(approvalCards, 0, "Automatic or denied policy must not ask");
  if (blocked || interrupted) {
    if (caseName === "ask-mode")
      assert.ok(
        calls.every(
          (call) => !call.offered_tools.includes("propose_page_method_call"),
        ),
      );
    assert.equal(
      await evaluate(
        harness.page,
        "Number(sessionStorage.getItem('s23Calls')??0)",
      ),
      interrupted ? 1 : 0,
    );
    results.push({
      pass: true,
      case: caseName,
      provider: "controlled",
      page_call_count: interrupted ? 1 : 0,
      calls,
    });
  } else {
    const proposals = calls.flatMap((item) => item.proposed ?? []);
    assert.equal(
      proposals.find((item) => item.name === "report_goal_status")?.goal_status,
      ["return-deny", "throw", "timeout", "replacement"].includes(caseName)
        ? "unknown"
        : "completed",
    );
    for (const name of [
      "search_page_resources",
      "read_page_resource",
      "propose_page_method_call",
      "report_goal_status",
    ])
      assert.ok(
        proposals.some((item) => item.name === name),
        `missing ${name}`,
      );
    assert.equal(
      proposals.filter((item) => item.name === "propose_page_method_call")
        .length,
      ["repeat", "plan"].includes(caseName) ? 2 : 1,
      "Provider must propose only intended logical calls",
    );
    if (caseName === "plan")
      assert.ok(proposals.some((item) => item.name === "submit_plan"));
    const methodCall = proposals.find(
      (item) => item.name === "propose_page_method_call",
    );
    const matchingResults = (calls.at(-1)?.returned ?? []).filter(
      (item) => item.tool_call_id === methodCall.id,
    );
    assert.equal(
      matchingResults.length,
      1,
      "method result must return once under its original tool_call_id",
    );
    assert.equal(
      matchingResults[0].dispatch,
      caseName === "timeout"
        ? "unknown"
        : caseName === "replacement"
          ? "not_dispatched"
          : "dispatched",
    );
    assert.equal(
      matchingResults[0].invocation,
      caseName === "throw"
        ? "threw"
        : caseName === "timeout"
          ? "timed_out"
          : caseName === "replacement"
            ? "not_started"
            : "returned",
    );
    assert.equal(
      matchingResults[0].has_return_data,
      !["return-deny", "throw", "timeout", "replacement"].includes(caseName),
    );
    assert.equal(
      matchingResults[0].returned_expected_sum,
      !["return-deny", "throw", "timeout", "replacement"].includes(caseName),
    );
    const expectedCount = ["repeat", "plan"].includes(caseName)
      ? 2
      : caseName === "replacement"
        ? 0
        : 1;
    assert.equal(
      await evaluate(harness.page, "window.methodCallCount"),
      expectedCount,
    );
    results.push({
      pass: true,
      provider: model ? live.provider : "controlled",
      model: model ?? "fixture",
      variant,
      case: caseName,
      elapsed_ms: Date.now() - started,
      method_call_id: methodCall.id,
      method_result_count: matchingResults.length,
      invocation: matchingResults[0].invocation,
      dispatch: matchingResults[0].dispatch,
      page_call_count: expectedCount,
      calls,
      offered_tool_names: [
        ...new Set(calls.flatMap((item) => item.offered_tools)),
      ],
    });
  }
};
