import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const reportPath = "docs/evidence/s27-reference-v2-first-2026-10-30.json";
const checker = "scripts/s27/check-reference.mjs";
test("reference checker detects changed provenance, native body and negative evidence", () => {
  const source = readFileSync(reportPath, "utf8");
  const dir = mkdtempSync(join(tmpdir(), "s27-reference-gate-"));
  try {
    const cases = [
      (r) => {
        r.results.find(
          (item) => item.scenario === "analysis",
        ).argumentsByName.date_range.sourceDigest = "0".repeat(64);
      },
      (r) => {
        const answer = r.results[0].nativeResponse.body.answers.decision;
        answer.confidence = answer.confidence === 0 ? 1 : 0;
      },
      (r) => {
        r.results.find(
          (item) => item.scenario === "search",
        ).argumentsByName.equipment.alternateRejected = false;
      },
    ];
    for (const [index, mutate] of cases.entries()) {
      const report = JSON.parse(source);
      mutate(report);
      const path = join(dir, `corrupt-${index}.json`);
      writeFileSync(path, JSON.stringify(report));
      const result = spawnSync(process.execPath, [checker, path], {
        encoding: "utf8",
      });
      assert.notEqual(result.status, 0, `corrupt case ${index} passed`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
