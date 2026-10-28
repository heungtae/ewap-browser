import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

// This evaluates recorded choices against known labels, not execution authority.
const corpusBytes = await readFile("docs/baselines/s27/holdout.json");
const corpusHash = createHash("sha256").update(corpusBytes).digest("hex");
assert.equal(
  corpusHash,
  "88b2a25e4a5fd5bac4cd2523cc09fd5e1cdb7c4ef37641b7e3d258b318742570",
  "frozen corpus changed",
);
const corpus = JSON.parse(corpusBytes);
const report = JSON.parse(
  await readFile(
    process.argv[2] ?? "docs/evidence/s27-live-2026-10-28.json",
    "utf8",
  ),
);
assert.equal(report.schema, "s27-qualification/v1");
assert.equal(report.corpusHash, corpusHash);
assert.equal(report.model, corpus.model);
assert.equal(report.templateVersion, corpus.templateVersion);
assert.equal(report.results.length, corpus.cases.length);
const cases = new Map(corpus.cases.map((item) => [item.id, item]));
const seen = new Set();
const mismatches = [];
let matched = 0;
for (const actual of report.results) {
  const expected = cases.get(actual.id);
  assert.ok(
    expected && !seen.has(actual.id),
    `unknown or duplicate ${actual.id}`,
  );
  seen.add(actual.id);
  const phases = Object.keys(expected.expected);
  assert.equal(actual.results.length, phases.length);
  const seenPhases = new Set();
  for (const result of actual.results) {
    assert.ok(phases.includes(result.phase) && !seenPhases.has(result.phase));
    seenPhases.add(result.phase);
    assert.equal(result.expected, expected.expected[result.phase]);
    assert.equal(typeof result.nativeSelection, "string");
    assert.ok(
      result.nativeProbabilities &&
        Object.hasOwn(result.nativeProbabilities, result.nativeSelection),
      "native selection is not present in the recorded distribution",
    );
    if (result.nativeSelection === expected.expected[result.phase]) matched++;
    else
      mismatches.push({
        case: actual.id,
        phase: result.phase,
        expected: expected.expected[result.phase],
        selected: result.nativeSelection,
      });
  }
}
console.log(
  JSON.stringify(
    {
      scope: "recorded native choice versus frozen expected label only",
      cases: seen.size,
      decisions: matched + mismatches.length,
      matched,
      mismatched: mismatches.length,
      mismatches,
    },
    null,
    2,
  ),
);
