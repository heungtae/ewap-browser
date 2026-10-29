import { strict as assert } from "node:assert";
import { test } from "node:test";
import { selectionMatches } from "./score-selection.mjs";

test("unlabeled cases accept an actual response but never a missing response", () => {
  assert.equal(selectionMatches(null, "UNKNOWN"), true);
  assert.equal(selectionMatches(undefined, "candidate"), true);
  assert.equal(selectionMatches(null, null), false);
  assert.equal(selectionMatches(null, ""), false);
});
test("labeled cases still require their expected answer or a bounded unknown", () => {
  assert.equal(selectionMatches("READ", "READ"), true);
  assert.equal(selectionMatches("READ", "ACTION"), false);
  assert.equal(selectionMatches("UNKNOWN", "INSPECT_MORE"), true);
  assert.equal(selectionMatches("UNKNOWN", "ACTION"), false);
});
