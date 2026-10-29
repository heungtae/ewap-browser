import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { loadS27 } from "./bundle.mjs";
import {
  alternateSource,
  expectedArguments,
  referenceFrame,
} from "./reference-fixture.mjs";
const hash = (data) => createHash("sha256").update(data).digest("hex");
const bytes = await readFile("docs/baselines/s27/holdout.json"),
  corpus = JSON.parse(bytes);
const report = JSON.parse(
  await readFile(process.argv[2] ?? "/tmp/s27-reference.json", "utf8"),
);
assert.equal(
  hash(bytes),
  "88b2a25e4a5fd5bac4cd2523cc09fd5e1cdb7c4ef37641b7e3d258b318742570",
);
assert.equal(report.schema, "s27-reference-v2/v1");
assert.equal(report.corpusHash, hash(bytes));
const { module: s27, protocolSourceDigest } = await loadS27();
assert.equal(report.protocolSourceDigest, protocolSourceDigest);
assert.equal(
  report.runnerDigest,
  hash(await readFile("scripts/s27/live-reference.mjs")),
);
assert.equal(
  report.fixtureDigest,
  hash(await readFile("scripts/s27/reference-fixture.mjs")),
);
assert.equal(report.model, corpus.model);
assert.equal(report.templateVersion, "controller-v2");
assert.equal(report.gptControllerCalls, 0);
assert.equal(report.browserDispatches, 0);
assert.equal(report.approvalFacts, 0);
assert.equal(report.results.length, corpus.cases.length);
assert.equal(
  new Set(report.results.map((row) => row.id)).size,
  corpus.cases.length,
);
assert.equal(report.http.length, corpus.cases.length);
assert.ok(report.http.every((status) => status === 200));
const seen = new Set();
for (const [index, item] of corpus.cases.entries()) {
  const row = report.results[index];
  assert.equal(row.id, item.id);
  assert.equal(row.language, item.language);
  assert.equal(row.scenario, item.scenario);
  assert.equal(row.order, item.order);
  const taskId = row.frame.context.taskId;
  assert.match(taskId, /^reference-[0-9a-f-]{36}$/);
  assert.ok(!seen.has(taskId));
  seen.add(taskId);
  assert.equal(row.frame.budgets.calls, 0);
  assert.equal(row.frame.budgets.inputTokens, 0);
  assert.equal(row.frame.budgets.outputTokens, 0);
  const budget = { snapshot: () => row.frame.budgets };
  const { frame, binding } = referenceFrame(s27, item, budget, taskId);
  assert.deepEqual(row.frame, frame);
  assert.equal(row.requestDigest, s27.digest(s27.nativeRequest(frame)));
  assert.equal(row.httpStatus, 200);
  assert.equal(report.http[index], row.httpStatus);
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
  assert.equal(accepted.outcome, row.outcome);
  assert.equal(accepted.selection, row.selection);
  assert.equal(row.outcome, "SELECTED");
  assert.equal(row.selection, item.expected.next_tool);
  assert.equal(row.counters.calls, 1);
  assert.equal(row.counters.inputTokens, parsed.usage.input_tokens);
  assert.equal(row.counters.outputTokens, parsed.usage.output_tokens);
  const candidate = frame.candidateSet.candidates.find(
    (value) => value.id === row.selection,
  );
  assert.ok(candidate);
  const fragment = s27.bindFragment(
    candidate,
    binding.sources,
    binding.context,
  );
  assert.equal(fragment.status, "BOUND");
  const expected = expectedArguments(item.scenario);
  assert.deepEqual(
    Object.keys(row.argumentsByName).sort(),
    Object.keys(expected).sort(),
  );
  for (const [name, value] of Object.entries(expected)) {
    const actual = fragment.arguments.get(name),
      saved = row.argumentsByName[name];
    assert.equal(actual?.status, "BOUND");
    assert.deepEqual(actual.value, value);
    assert.equal(saved.sourceDigest, actual.sourceDigest);
    assert.equal(saved.status, "BOUND");
    assert.equal(saved.valueMatched, true);
    const alternative = alternateSource(s27, name, binding);
    assert.equal(
      s27.bindArgument(alternative.sources.get(name), alternative.context)
        .status,
      "BOUND",
    );
    const denied = s27.bindFragment(
      candidate,
      alternative.sources,
      alternative.context,
    );
    assert.equal(denied.status, "NEED_INPUT");
    assert.equal(denied.arguments.get(name)?.reason, "ARGUMENT_SOURCE_CHANGED");
    assert.equal(saved.alternateValid, true);
    assert.equal(saved.alternateRejected, true);
    assert.equal(saved.alternateReason, "ARGUMENT_SOURCE_CHANGED");
  }
  assert.equal(row.passed, true);
}
console.log(
  "S27 v2 reference next-step selections and independently reconstructed bindings PASS; no browser dispatch was tested",
);
