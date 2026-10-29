import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const reportPath = "docs/evidence/s27-cross2-first-2026-10-29.json";
const check = "scripts/s27/check-multiphase.mjs";
test("qualification checks the complete recorded report", () => {
  const result = execFileSync(process.execPath, [check, reportPath], {
    encoding: "utf8",
  });
  assert.match(result, /"result":"PASS"/);
});
test("qualification rejects corrupted response, frame, binding and call evidence", () => {
  const source = readFileSync(reportPath, "utf8");
  const dir = mkdtempSync(join(tmpdir(), "s27-gate-"));
  try {
    const cases = [
      (report) => {
        report.results[0].results[0].counters.activeMs = 10001;
      },
      (report) => {
        report.results[0].results[0].counters.responseByteLimit = 0;
      },
      (report) => {
        const answer =
          report.results[0].results[0].nativeResponse.body.answers.decision;
        answer.confidence = answer.confidence === 0 ? 1 : 0;
      },
      (report) => {
        report.results[0].results[0].frame.context.planRevision++;
      },
      (report) => {
        report.results
          .find((item) => item.id === "f05")
          .results.find(
            (row) => row.argumentName === "query",
          ).negative.rejected = false;
      },
      (report) => {
        report.gptControllerCalls = 1;
      },
    ];
    for (const [index, mutate] of cases.entries()) {
      const report = JSON.parse(source);
      mutate(report);
      const path = join(dir, `corrupt-${index}.json`);
      writeFileSync(path, JSON.stringify(report));
      const result = spawnSync(process.execPath, [check, path], {
        encoding: "utf8",
      });
      assert.notEqual(result.status, 0, `corrupt case ${index} passed`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
