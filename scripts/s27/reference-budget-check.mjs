import assert from "node:assert/strict";

// Recheck recorded structural accounting; elapsed wall-clock deadlines cannot
// be independently recovered from the provider's unsigned response.
export function verifyReferenceBudget(
  s27,
  row,
  frame,
  parsed,
  previous,
  deadline,
) {
  const before = s27.budgetSnapshotSchema.parse(frame.budgets);
  const after = s27.budgetSnapshotSchema.parse(row.counters);
  const requestBytes = s27.bytes(s27.nativeRequest(frame));
  assert.equal(before.activeMs, previous.activeMs);
  assert.equal(before.overallDeadline, deadline);
  assert.equal(after.overallDeadline, deadline);
  assert.equal(
    before.responseByteLimit,
    Math.min(1024, 4000 - previous.outputTokens),
  );
  assert.equal(
    after.responseByteLimit,
    Math.min(1024, 4000 - after.outputTokens),
  );
  assert.ok(before.calls < 24 && before.activeMs < 180000);
  assert.ok(requestBytes > 0 && previous.inputTokens + requestBytes <= 48000);
  assert.ok(previous.outputTokens + 1024 <= 4000);
  assert.ok(parsed.usage.input_tokens <= requestBytes);
  assert.ok(parsed.usage.output_tokens <= 1024);
  assert.ok(s27.bytes(row.nativeResponse.body) <= before.responseByteLimit);
  assert.ok(after.activeMs >= before.activeMs && after.activeMs <= 180000);
  assert.ok(after.activeMs - before.activeMs <= 10000);
}

export function verifySinglePhaseBudget(s27, row, frame, parsed) {
  verifyReferenceBudget(
    s27,
    row,
    frame,
    parsed,
    { calls: 0, inputTokens: 0, outputTokens: 0, activeMs: 0 },
    frame.budgets.overallDeadline,
  );
}
