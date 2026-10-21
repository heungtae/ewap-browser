import { expect, it } from "vitest";
import { validateResult } from "../../../../../packages/analysis-engine/src/validate-result.js";
import { fixture, result } from "./support.js";
it("S34 supports actual numeric findings with matching immutable evidence", async () => {
  const f = await fixture(),
    input = await f.input();
  expect(validateResult(input, result(input)).status).toBe("SUPPORTED");
});
it.each([
  "dangling",
  "contradictory",
  "causal",
  "recommendation",
  "foreign-task",
  "row",
])(
  "S34 rejects %s findings rather than accepting citation syntax",
  async (kind) => {
    const f = await fixture(),
      input = await f.input(),
      r = result(input);
    if (kind === "dangling") r.findings[0]!.evidenceIds = ["unrelated"];
    if (kind === "contradictory") r.findings[0]!.value = 500;
    if (kind === "causal")
      r.summary = "The total fell because a machine failed";
    if (kind === "recommendation")
      r.recommendations = ["Production must be stopped"];
    if (kind === "foreign-task") r.taskId = "foreign_task";
    if (kind === "row") {
      r.findings[0]!.op = "cell";
      r.findings[0]!.rowId = "foreign_row";
    }
    expect(() => validateResult(input, r)).toThrow(/ANALYSIS_/);
  },
);
it("S34 returns typed data requirements for JEV with no executable commands", async () => {
  const f = await fixture(),
    input = await f.input(),
    r = result(input);
  r.additionalData = [
    { datasetId: "dataset_one", fields: ["amount"], coverage: "complete" },
  ];
  r.limitations = ["MORE_DATA_REQUIRED"];
  expect(validateResult(input, r).status).toBe("NEEDS_DATA");
  expect(() =>
    validateResult(input, {
      ...r,
      additionalData: [{ ...r.additionalData[0], tool: "web.click" }],
    }),
  ).toThrow();
});
it("S34 requires partial and redaction limits and never fabricates complete coverage", async () => {
  const f = await fixture(),
    input = await f.input(),
    r = result(input);
  input.datasets[0]!.partial = true;
  input.datasets[0]!.redacted = true;
  expect(() => validateResult(input, r)).toThrow("ANALYSIS_MISSING_LIMITATION");
  r.limitations = ["PARTIAL_COVERAGE", "REDACTED"];
  expect(validateResult(input, r).status).toBe("SUPPORTED");
});
