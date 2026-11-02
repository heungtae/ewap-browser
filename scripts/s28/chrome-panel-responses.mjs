import assert from "node:assert/strict";
import { evaluate, waitFor } from "../chrome-cdp-utils.mjs";
export async function qualifyPromptResponses(panel, h) {
  const { fixture, runId, prompt, emit, latest, count, action } = h;
  await emit("run_started", { mode: "act", permission_mode: "standard" });
  const bound = prompt();
  await emit("action_review_required", { action, prompt: bound });
  const before = await count();
  await evaluate(
    panel,
    `${latest("review")}.querySelector('button.primary').click();${latest("review")}.querySelector('button.primary').click();true`,
  );
  await waitFor(
    async () => (await count()) === before + 1,
    3000,
    "ONE_RESPONSE",
  );
  const response = await evaluate(panel, `${fixture}.responses().at(-1)`);
  assert.deepEqual(response, {
    kind: "review",
    runId,
    prompt: bound,
    decision: "approve",
  });
  await emit("value_required", {
    action,
    value_kind: "text",
    prompt: prompt({ expiresAt: Date.now() - 1 }),
  });
  assert.equal(
    await evaluate(panel, `${latest("value")}.querySelector('input').disabled`),
    true,
  );
  const valuePrompt = prompt();
  await emit("value_required", {
    action,
    value_kind: "text",
    prompt: valuePrompt,
  });
  await evaluate(
    panel,
    `${latest("value")}.querySelector('input').value='CONTROLLED_VALUE';${latest("value")}.querySelector('form').requestSubmit();true`,
  );
  await waitFor(
    async () => (await count()) === before + 2,
    3000,
    "BOUND_VALUE_RESPONSE",
  );
  assert.deepEqual(await evaluate(panel, `${fixture}.responses().at(-1)`), {
    kind: "value",
    runId,
    prompt: valuePrompt,
    value: "CONTROLLED_VALUE",
  });
  assert.equal(
    await evaluate(panel, `${latest("value")}.querySelector('input').value`),
    "",
  );
  await emit("source_consent_required", {
    prompt: prompt(),
    purpose: "source",
    host: "fixture.test",
    resource_count: 1,
  });
  await evaluate(panel, `${fixture}.online(false);${fixture}.tick();true`);
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('#status').textContent.includes('Backend disconnected')",
      ),
    3000,
    "OFFLINE_UI",
  );
  assert.equal(
    await evaluate(
      panel,
      `${latest("permission")}.querySelector('button').disabled`,
    ),
    true,
  );
  await evaluate(panel, `${fixture}.online(true);${fixture}.tick();true`);
  await waitFor(
    () =>
      evaluate(
        panel,
        "!document.querySelector('#status').textContent.includes('Backend disconnected')",
      ),
    3000,
    "RECONNECTED_UI",
  );
  assert.equal(
    await evaluate(
      panel,
      `${latest("permission")}.querySelector('button').disabled`,
    ),
    true,
  );
  assert.equal(await count(), before + 2);
  await emit("source_consent_required", {
    prompt: prompt(),
    purpose: "source",
    host: "fixture.test",
    resource_count: 1,
  });
  await evaluate(
    panel,
    `${latest("permission")}.querySelector('button.danger').click();true`,
  );
  await waitFor(
    async () => (await count()) === before + 3,
    3000,
    "FRESH_CONSENT",
  );
  assert.equal(
    (await evaluate(panel, `${fixture}.responses().at(-1)`)).allowed,
    false,
  );
  await emit("value_required", {
    action,
    value_kind: "text",
    prompt: prompt(),
  });
  await evaluate(
    panel,
    `${latest("value")}.querySelector('input').value='EXPIRE_ME';true`,
  );
  await emit("value_required", {
    action,
    value_kind: "text",
    prompt: prompt({ expiresAt: Date.now() + 250 }),
  });
  assert.equal(
    await evaluate(
      panel,
      "[...document.querySelectorAll('.event-card[data-kind=value] input')].slice(0,-1).every(e=>e.value==='')",
    ),
    true,
  );
  await waitFor(
    () => evaluate(panel, `${latest("value")}.querySelector('input').disabled`),
    3000,
    "PROMPT_EXPIRY",
  );
  await emit("action_review_required", { action, prompt: prompt() });
  await evaluate(
    panel,
    `${fixture}.rejectNext();${latest("review")}.querySelector('button.primary').click();true`,
  );
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('#status').textContent.includes('응답 전달 결과를 확인하지 못했습니다')",
      ),
    3000,
    "UNKNOWN_RESPONSE",
  );
  assert.equal(
    await evaluate(
      panel,
      "document.body.textContent.includes('FIXTURE_PRIVATE_ERROR')",
    ),
    false,
  );
  assert.equal(
    await evaluate(
      panel,
      `${latest("review")}.querySelector('button.primary').disabled`,
    ),
    true,
  );
}
