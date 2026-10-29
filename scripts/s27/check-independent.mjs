import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadS27 } from "./bundle.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const bytes = await readFile("docs/baselines/s27-independent/corpus.json");
const corpus = JSON.parse(bytes);
const report = JSON.parse(
  await readFile(
    process.argv[2] ?? "docs/evidence/s27-independent-intent-2026-10-29.json",
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
  hash(await readFile("scripts/s27/live-independent.mjs")),
);
assert.equal(report.templateVersion, "controller-v2");
assert.equal(report.model, "jev-1.13.0");
assert.equal(report.results.length, corpus.cases.length);
assert.equal(
  new Set(report.results.map((item) => item.id)).size,
  corpus.cases.length,
);
assert.equal(report.http.length, corpus.cases.length);
assert.ok(report.http.every((status) => status === 200));
for (const item of corpus.cases) {
  const result = report.results.find((entry) => entry.id === item.id);
  assert.ok(result, `missing ${item.id}`);
  const expected = { read: "READ", action: "ACTION", analysis: "ANALYSIS" }[
    item.category
  ];
  assert.equal(result.expected, expected);
  assert.equal(result.selection, expected);
  assert.equal(result.outcome, "SELECTED");
  assert.equal(result.matched, true);
  if (item.category === "action")
    assert.deepEqual(result.binding, { status: "BOUND", matches: true });
}
console.log(
  "Independent synthetic intent and separate user-span check PASS; full S27 remains separate",
);
