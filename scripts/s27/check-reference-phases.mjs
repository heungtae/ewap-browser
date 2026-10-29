import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadS27 } from "./bundle.mjs";
import { phases } from "./multiphase-vocabulary.mjs";
import { referencePhase } from "./reference-phases.mjs";
import { alternateSource, expectedArguments } from "./reference-fixture.mjs";
import { verifyReferenceBudget } from "./reference-budget-check.mjs";
const hash = (data) => createHash("sha256").update(data).digest("hex");
const bytes = await readFile("docs/baselines/s27/holdout.json"),
  corpus = JSON.parse(bytes);
const auditOnly = process.argv.includes("--audit");
const path =
  process.argv.slice(2).find((value) => value !== "--audit") ??
  "/tmp/s27-reference-phases.json";
const report = JSON.parse(await readFile(path, "utf8"));
assert.equal(
  hash(bytes),
  "88b2a25e4a5fd5bac4cd2523cc09fd5e1cdb7c4ef37641b7e3d258b318742570",
);
assert.equal(report.schema, "s27-reference-phases/v1");
assert.equal(report.corpusHash, hash(bytes));
const { module: s27, protocolSourceDigest } = await loadS27();
assert.equal(report.protocolSourceDigest, protocolSourceDigest);
for (const [field, file] of Object.entries({
  runnerDigest: "scripts/s27/live-reference-phases.mjs",
  fixtureDigest: "scripts/s27/reference-phases.mjs",
  bindingDigest: "scripts/s27/reference-fixture.mjs",
  phaseListDigest: "scripts/s27/multiphase-vocabulary.mjs",
}))
  assert.equal(report[field], hash(await readFile(file)), field);
assert.equal(report.model, corpus.model);
assert.equal(report.templateVersion, "controller-v2");
assert.equal(report.gptControllerCalls, 0);
assert.equal(report.browserDispatches, 0);
assert.equal(report.approvalFacts, 0);
assert.equal(report.results.length, corpus.cases.length);
assert.equal(
  new Set(report.results.map((item) => item.id)).size,
  corpus.cases.length,
);
assert.equal(report.http.length, corpus.cases.length * phases.length);
assert.ok(report.http.every((status) => status === 200));
const taskIds = new Set(),
  mismatches = [];
for (const [index, item] of corpus.cases.entries()) {
  const result = report.results[index];
  assert.equal(result.id, item.id);
  assert.equal(result.language, item.language);
  assert.equal(result.scenario, item.scenario);
  assert.equal(result.order, item.order);
  assert.equal(result.observations.length, phases.length);
  const taskId = result.observations[0].frame.context.taskId;
  assert.match(taskId, /^sequence-[0-9a-f-]{36}$/);
  assert.ok(!taskIds.has(taskId));
  taskIds.add(taskId);
  const c = { ...item, taskId },
    binding = s27.scenarioBindings(c),
    prior = [];
  let previous = { calls: 0, inputTokens: 0, outputTokens: 0, activeMs: 0 },
    deadline;
  for (const [offset, phase] of phases.entries()) {
    const row = result.observations[offset];
    assert.equal(row.phase, phase);
    assert.equal(row.frame.context.taskId, taskId);
    assert.equal(row.frame.budgets.calls, previous.calls);
    assert.equal(row.frame.budgets.inputTokens, previous.inputTokens);
    assert.equal(row.frame.budgets.outputTokens, previous.outputTokens);
    deadline ??= row.frame.budgets.overallDeadline;
    assert.equal(row.frame.budgets.overallDeadline, deadline);
    const { frame, expected } = referencePhase(
      s27,
      c,
      phase,
      { snapshot: () => row.frame.budgets },
      prior,
    );
    assert.deepEqual(row.frame, frame);
    assert.equal(row.requestDigest, s27.digest(s27.nativeRequest(frame)));
    assert.equal(row.httpStatus, 200);
    assert.equal(report.http[index * phases.length + offset], 200);
    assert.equal(row.captureError, null);
    assert.equal(row.nativeResponse?.contentType, "application/json");
    assert.equal(
      row.nativeResponse.bodyDigest,
      s27.digest(row.nativeResponse.body),
    );
    const parsed = s27.parseNativeResponse(
      row.nativeResponse.body,
      s27.nativeRequest(frame).questions,
      report.model,
    );
    const accepted = s27.acceptResult(frame, row.validatedResult);
    assert.deepEqual(parsed.answers, accepted.result.answers);
    assert.deepEqual(parsed.usage, accepted.result.usage);
    assert.equal(parsed.model, accepted.result.model);
    verifyReferenceBudget(s27, row, frame, parsed, previous, deadline);
    assert.equal(row.outcome, accepted.outcome);
    assert.equal(row.selection, accepted.selection);
    assert.equal(row.expected, expected);
    assert.equal(row.counters.calls, previous.calls + 1);
    assert.equal(
      row.counters.inputTokens,
      previous.inputTokens + parsed.usage.input_tokens,
    );
    assert.equal(
      row.counters.outputTokens,
      previous.outputTokens + parsed.usage.output_tokens,
    );
    assert.ok(
      row.counters.calls <= 24 &&
        row.counters.inputTokens <= 48000 &&
        row.counters.outputTokens <= 4000,
    );
    previous = row.counters;
    const selected = frame.candidateSet.candidates.find(
      (candidate) => candidate.id === row.selection,
    );
    const fragment = selected
      ? s27.bindFragment(selected, binding.sources, binding.context)
      : undefined;
    const expectedValues =
      phase === "next_tool" ? expectedArguments(item.scenario) : {};
    assert.deepEqual(
      Object.keys(row.argumentsByName).sort(),
      Object.keys(expectedValues).sort(),
    );
    let argumentsValid = true;
    for (const [name, value] of Object.entries(expectedValues)) {
      const actual = fragment?.arguments.get(name),
        saved = row.argumentsByName[name];
      const alternate = alternateSource(s27, name, binding);
      const valid = s27.bindArgument(
        alternate.sources.get(name),
        alternate.context,
      );
      const denied = selected
        ? s27.bindFragment(selected, alternate.sources, alternate.context)
        : undefined;
      const alternative = denied?.arguments.get(name);
      const expectedSaved = {
        status: actual?.status ?? null,
        valueMatched:
          actual?.status === "BOUND" &&
          s27.digest(actual.value) === s27.digest(value),
        sourceDigest: actual?.status === "BOUND" ? actual.sourceDigest : null,
        alternateValid: valid.status === "BOUND",
        alternateRejected: denied?.status === "NEED_INPUT",
        alternateReason:
          alternative?.status === "NEED_INPUT" ? alternative.reason : null,
      };
      assert.deepEqual(saved, expectedSaved);
      argumentsValid &&=
        saved.status === "BOUND" &&
        saved.valueMatched &&
        saved.alternateValid &&
        saved.alternateRejected &&
        saved.alternateReason === "ARGUMENT_SOURCE_CHANGED";
    }
    assert.equal(
      row.binding,
      phase === "next_tool" ? (fragment?.status ?? null) : "NOT_APPLICABLE",
    );
    const matched =
      row.nativeResponse !== null &&
      row.outcome === "SELECTED" &&
      row.selection === expected &&
      fragment?.status === "BOUND" &&
      argumentsValid;
    assert.equal(row.matched, matched);
    if (!matched) mismatches.push(`${item.id}/${phase}`);
    prior.push({ phase, selection: row.selection });
  }
  assert.equal(
    result.passed,
    result.observations.every((row) => row.matched),
  );
}
console.log(
  JSON.stringify({
    result: mismatches.length ? "FEASIBILITY_FAILED" : "PASS",
    observations: corpus.cases.length * phases.length,
    mismatches: mismatches.length,
    casesPassed: report.results.filter((item) => item.passed).length,
    cases: corpus.cases.length,
  }),
);
if (!auditOnly)
  assert.equal(mismatches.length, 0, "S27 reference phase evaluation failed");
