import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadS27 } from "./bundle.mjs";
import { verifyReferenceBudget } from "./reference-budget-check.mjs";

const reportPath = "docs/evidence/s27-reference-phases-first-2026-10-30.json";
const checker = "scripts/s27/check-reference-phases.mjs";
test("reference phase gate rejects altered sequence, native response and source binding", () => {
  const source = readFileSync(reportPath, "utf8");
  const clean = spawnSync(process.execPath, [checker, reportPath], {
    encoding: "utf8",
  });
  assert.equal(clean.status, 0, clean.stderr);
  const directory = mkdtempSync(join(tmpdir(), "s27-phase-gate-"));
  try {
    const cases = [
      (r) => {
        r.results[0].observations[1].frame.budgets.calls = 0;
      },
      (r) => {
        r.results[0].observations[0].counters.activeMs = 179999;
      },
      (r) => {
        r.results[0].observations[0].counters.responseByteLimit = 7;
      },
      (r) => {
        const a =
          r.results[0].observations[0].nativeResponse.body.answers.decision;
        a.confidence = a.confidence === 0 ? 1 : 0;
      },
      (r) => {
        r.results
          .find((item) => item.scenario === "analysis")
          .observations.find(
            (row) => row.phase === "next_tool",
          ).argumentsByName.date_range.sourceDigest = "0".repeat(64);
      },
    ];
    for (const [index, mutate] of cases.entries()) {
      const report = JSON.parse(source);
      mutate(report);
      const path = join(directory, `corrupt-${index}.json`);
      writeFileSync(path, JSON.stringify(report));
      const result = spawnSync(process.execPath, [checker, path], {
        encoding: "utf8",
      });
      assert.notEqual(result.status, 0, `corrupt case ${index} passed`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("reference budget checks reject specific accounting and body violations", async () => {
  const s27 = (await loadS27()).module;
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const row = report.results[0].observations[0],
    frame = row.frame;
  const parsed = s27.parseNativeResponse(
    row.nativeResponse.body,
    s27.nativeRequest(frame).questions,
    report.model,
  );
  const previous = { calls: 0, inputTokens: 0, outputTokens: 0, activeMs: 0 };
  const verify = (value, answer = parsed) =>
    verifyReferenceBudget(
      s27,
      value,
      frame,
      answer,
      previous,
      frame.budgets.overallDeadline,
    );
  assert.doesNotThrow(() => verify(row));
  const altered = (change) => {
    const value = structuredClone(row);
    change(value);
    return value;
  };
  assert.throws(() =>
    verify(
      altered((value) => {
        value.counters.activeMs = 179999;
      }),
    ),
  );
  assert.throws(() =>
    verify(
      altered((value) => {
        value.counters.overallDeadline++;
      }),
    ),
  );
  assert.throws(() =>
    verify(
      altered((value) => {
        value.counters.responseByteLimit = 7;
      }),
    ),
  );
  assert.throws(() =>
    verify(row, {
      ...parsed,
      usage: {
        ...parsed.usage,
        input_tokens: s27.bytes(s27.nativeRequest(frame)) + 1,
      },
    }),
  );
  assert.throws(() =>
    verify(row, { ...parsed, usage: { ...parsed.usage, output_tokens: 1025 } }),
  );
  assert.throws(() =>
    verify(
      altered((value) => {
        value.nativeResponse.body.padding = "x".repeat(2048);
      }),
    ),
  );
  const malformed = structuredClone(row.nativeResponse.body);
  malformed.answers.decision.probabilities = {};
  assert.throws(() =>
    s27.parseNativeResponse(
      malformed,
      s27.nativeRequest(frame).questions,
      report.model,
    ),
  );
});
