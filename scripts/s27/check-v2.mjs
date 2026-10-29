import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadS27 } from "./bundle.mjs";
import { expectedSelections, selectionMatches } from "./score-selection.mjs";

const bytes = await readFile("docs/baselines/s27-v2/holdout.json");
const corpus = JSON.parse(bytes);
const report = JSON.parse(
  await readFile(
    process.argv[2] ?? "docs/evidence/s27-v2-no-threshold-2026-10-28.json",
    "utf8",
  ),
);
const hash = createHash("sha256").update(bytes).digest("hex");
assert.equal(
  hash,
  "c764598f841b0fc26218300a09e03f265c40a47deda017ed4209208d5870a861",
);
assert.equal(report.corpusHash, hash);
assert.equal(report.model, corpus.model);
assert.equal(report.templateVersion, corpus.templateVersion);
assert.equal(
  report.protocolSourceDigest,
  (await loadS27()).protocolSourceDigest,
);
assert.equal(
  report.runnerDigest,
  createHash("sha256")
    .update(await readFile("scripts/s27/live-v2.mjs"))
    .digest("hex"),
);
assert.equal(report.results.length, corpus.cases.length);
assert.equal(
  new Set(report.results.map((result) => result.id)).size,
  corpus.cases.length,
);
for (const item of corpus.cases) {
  const result = report.results.find((entry) => entry.id === item.id);
  assert.ok(result, `missing ${item.id}`);
  assert.equal(result.phase, item.phase);
  const expected = expectedSelections(item.expected);
  assert.deepEqual(result.expected, expected);
  assert.ok(
    selectionMatches(item.expected, result.nativeSelection),
    `native mismatch ${item.id}`,
  );
  assert.ok(
    selectionMatches(item.expected, result.gatedSelection),
    `gated mismatch ${item.id}`,
  );
}
console.log(
  "S27 v2 synthetic gated evaluation PASS; broader qualification remains separate",
);
