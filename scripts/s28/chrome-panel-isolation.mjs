import assert from "node:assert/strict";
import { evaluate, waitFor } from "../chrome-cdp-utils.mjs";
export async function qualifyPromptIsolation(panel, h) {
  const { fixture, prompt, emit, latest, action } = h;
  await emit("action_review_required", { action, prompt: prompt() });
  await evaluate(
    panel,
    `${fixture}.holdNext();${latest("review")}.querySelector('button.primary').click();true`,
  );
  await waitFor(() => evaluate(panel, `${fixture}.held()`), 3000, "HELD_REPLY");
  await emit("source_consent_required", {
    prompt: prompt(),
    purpose: "source",
    host: "fixture.test",
    resource_count: 1,
  });
  await evaluate(panel, `${fixture}.rejectHeld();true`);
  await waitFor(
    () => evaluate(panel, `!${fixture}.held()`),
    3000,
    "HELD_REPLY_REJECTED",
  );
  assert.equal(
    await evaluate(
      panel,
      "document.querySelector('#status').textContent.includes('페이지 소스 전달 동의')",
    ),
    true,
  );
  assert.equal(
    await evaluate(
      panel,
      `${latest("permission")}.querySelector('button.primary').disabled`,
    ),
    false,
  );
  await emit(
    "run_started",
    { mode: "ask", permission_mode: "standard" },
    "ask-run",
    "ask-request",
  );
  await emit(
    "action_review_required",
    { action, prompt: prompt({ requestId: "ask-request" }) },
    "ask-run",
    "ask-request",
  );
  assert.equal(
    await evaluate(
      panel,
      `${latest("review")}.querySelector('button.primary').disabled`,
    ),
    true,
  );
  await emit("run_terminal", { outcome: "VERIFIED" }, "ask-run", "ask-request");
  const cards = await evaluate(
    panel,
    "document.querySelectorAll('.event-card').length",
  );
  await emit(
    "action_review_required",
    { action, prompt: prompt({ requestId: "ask-request" }) },
    "ask-run",
    "ask-request",
  );
  assert.equal(
    await evaluate(panel, "document.querySelectorAll('.event-card').length"),
    cards,
  );
}
