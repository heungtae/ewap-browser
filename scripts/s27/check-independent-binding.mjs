import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadS27 } from "./bundle.mjs";
const hash = (data) => createHash("sha256").update(data).digest("hex");
const bytes = await readFile("docs/baselines/s27-independent/corpus.json");
const corpus = JSON.parse(bytes);
const report = JSON.parse(
  await readFile(
    process.argv[2] ?? "docs/evidence/s27-independent-binding-2026-10-29.json",
    "utf8",
  ),
);
assert.equal(
  hash(bytes),
  "654eec4155c043c89c3e5c9646c773055c92c4e08b63d53d8f1fd685d2c029fc",
);
assert.equal(report.corpusHash, hash(bytes));
assert.equal(
  report.protocolSourceDigest,
  (await loadS27()).protocolSourceDigest,
);
assert.equal(
  report.runnerDigest,
  hash(await readFile("scripts/s27/live-independent-binding.mjs")),
);
assert.equal(
  report.negativeHelperDigest,
  hash(await readFile("scripts/s27/binding-negative.mjs")),
);
assert.equal(report.model, "jev-1.13.0");
assert.equal(report.templateVersion, "controller-v2");
const cases = corpus.cases.filter((item) => item.category === "action");
assert.equal(cases.length, 4);
assert.equal(report.results.length, cases.length);
assert.equal(new Set(report.results.map((item) => item.id)).size, cases.length);
assert.equal(report.http.length, cases.length);
assert.ok(report.http.every((status) => status === 200));
for (const item of cases) {
  const result = report.results.find((entry) => entry.id === item.id);
  assert.ok(result, `missing ${item.id}`);
  assert.equal(result.selection, "search_form");
  assert.equal(result.outcome, "SELECTED");
  assert.equal(result.binding, "BOUND");
  assert.equal(result.valueMatched, true);
  assert.equal(result.changedSourceRejected, true);
  assert.equal(result.changedSourceValid, true);
  assert.equal(result.changedSourceReason, "ARGUMENT_SOURCE_CHANGED");
  assert.equal(result.passed, true);
}
console.log(
  "Independent selected-fragment binding PASS; browser dispatch is not qualified",
);
