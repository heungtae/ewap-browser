import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadS27 } from "./bundle.mjs";

// The original full report remains failed. This verifies only its unambiguous
// reference next-step and provenance observations; it does not relabel cases.
const bytes = await readFile("docs/baselines/s27/holdout.json");
const corpus = JSON.parse(bytes);
const report = JSON.parse(
  await readFile("docs/evidence/s27-v1-current-2026-10-29.json", "utf8"),
);
const hash = createHash("sha256").update(bytes).digest("hex");
assert.equal(
  hash,
  "88b2a25e4a5fd5bac4cd2523cc09fd5e1cdb7c4ef37641b7e3d258b318742570",
);
assert.equal(report.corpusHash, hash);
assert.equal(
  report.protocolSourceDigest,
  (await loadS27()).protocolSourceDigest,
);
assert.equal(report.model, corpus.model);
assert.equal(report.protocol, corpus.protocol);
assert.equal(report.templateVersion, corpus.templateVersion);
assert.equal(report.result, "FEASIBILITY_FAILED");
assert.equal(report.gptControllerCalls, 0);
assert.equal(report.browserDispatches, 0);
assert.equal(report.approvalFacts, 0);
assert.equal(report.http.length, 96);
assert.ok(report.http.every((entry) => entry.status === 200));
assert.equal(report.results.length, corpus.cases.length);
assert.equal(
  new Set(report.results.map((item) => item.id)).size,
  corpus.cases.length,
);
const bindings = {
  aggregation: { dataset: "observed_value" },
  search: { equipment: "user_span" },
  analysis: { date_range: "derived_value", dataset: "observed_value" },
};
for (const item of corpus.cases) {
  const result = report.results.find((entry) => entry.id === item.id);
  assert.ok(result, `missing ${item.id}`);
  const next = result.results.filter((entry) => entry.phase === "next_tool");
  assert.equal(next.length, 1);
  const entry = next[0];
  assert.equal(entry.expected, item.expected.next_tool);
  assert.equal(entry.nativeSelection, item.expected.next_tool);
  assert.equal(entry.selection, item.expected.next_tool);
  assert.equal(entry.outcome, "SELECTED");
  assert.equal(entry.matched, true);
  const expectedBindings = bindings[item.scenario];
  assert.ok(expectedBindings);
  assert.equal(
    entry.boundArguments.length,
    Object.keys(expectedBindings).length,
  );
  for (const [name, kind] of Object.entries(expectedBindings)) {
    const argument = entry.boundArguments.find((value) => value.name === name);
    assert.equal(argument?.status, "BOUND", `${item.id}/${name}`);
    assert.equal(argument.kind, kind);
    assert.match(argument.sourceDigest, /^[a-f0-9]{64}$/);
  }
}
console.log(
  "Original reference next-step and provenance observations PASS; original full report remains failed",
);
