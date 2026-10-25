import { test } from "node:test";
import assert from "node:assert/strict";
import { presentationGate } from "./qualify.mjs";
const report = () => ({
  result: "PASS",
  automaticRecovery: true,
  pageLifecycleAndReload: true,
  focusPreserved: true,
  presentation: {
    result: "PASS",
    unverified: [],
    cases: [
      {
        name: "one",
        result: "MATCH",
        viewportMatch: true,
        fontMatch: true,
        missing: [],
        extra: [],
        changed: [],
      },
    ],
  },
});
test("recovery success cannot stand in for missing M00 states", () => {
  assert.equal(presentationGate(report(), ["one", "two"]).result, "BLOCKED");
});
test("changed structure or incomplete interactions block a claimed PASS", () => {
  const changed = report();
  changed.presentation.cases[0].changed = ["approval-control"];
  assert.ok(
    presentationGate(changed, ["one"]).blockers.includes(
      "M00_PRESENTATION_DIFFERENCES",
    ),
  );
  const partial = report();
  partial.presentation.unverified = ["consent dialog"];
  assert.ok(
    presentationGate(partial, ["one"]).blockers.includes(
      "INTERACTION_CONTINUITY_UNVERIFIED",
    ),
  );
});
test("duplicate state IDs cannot inflate continuity coverage", () => {
  const duplicate = report();
  duplicate.presentation.cases.push(duplicate.presentation.cases[0]);
  assert.equal(presentationGate(duplicate, ["one"]).result, "BLOCKED");
  assert.equal(presentationGate(report(), ["one"]).result, "PASS");
});
