import assert from "node:assert/strict";
import { loadS27 } from "./bundle.mjs";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const corpusBytes = await readFile("docs/baselines/s27/holdout.json");
const corpus = JSON.parse(corpusBytes);
const report = JSON.parse(
  await readFile(
    process.argv[2] ?? "docs/evidence/s27-live-final-2026-10-19.json",
    "utf8",
  ),
);
assert.equal(
  report.corpusHash,
  createHash("sha256").update(corpusBytes).digest("hex"),
);
assert.equal(report.model, corpus.model);
assert.equal(report.protocol, corpus.protocol);
assert.equal(report.templateVersion, corpus.templateVersion);
assert.equal(report.gptControllerCalls, 0);
assert.equal(
  report.result,
  "PASS",
  "S27 LIVE FEASIBILITY FAILED: S33 completion remains blocked",
);
const { protocolSourceDigest } = await loadS27();
assert.equal(
  report.protocolSourceDigest,
  protocolSourceDigest,
  "Qualification is stale for current protocol implementation",
);
assert.equal(report.results.length, corpus.cases.length);
assert.equal(
  new Set(report.results.map((c) => c.id)).size,
  corpus.cases.length,
);
for (const c of corpus.cases) {
  const result = report.results.find((r) => r.id === c.id);
  assert.equal(result?.passed, true);
  assert.equal(result.results.length, Object.keys(c.expected).length);
  assert.equal(
    new Set(result.results.map((r) => r.phase)).size,
    Object.keys(c.expected).length,
  );
  for (const [phase, expected] of Object.entries(c.expected)) {
    const answer = result.results.find((r) => r.phase === phase);
    assert.equal(answer?.selection, expected);
    assert.equal(answer.nativeSelection, expected);
    assert.ok(
      answer.nativeConfidence >= 0.9 &&
        answer.nativeProbabilities[expected] >= 0.9 &&
        answer.evidenceSufficiency >= 0.9,
    );
    assert.ok(
      answer.counters.calls <= 24 &&
        answer.counters.inputTokens <= 48000 &&
        answer.counters.outputTokens <= 4000,
    );
  }
}
console.log("S27 live feasibility gate PASS");
