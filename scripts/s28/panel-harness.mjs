import assert from "node:assert/strict";
import { evaluate, waitFor } from "../chrome-cdp-utils.mjs";
export function panelHarness(
  panel,
  runId = "guard-run",
  requestId = "guard-request",
) {
  const fixture = "window.__s28PanelFixture";

  let revision = 0;
  const prompt = (extra = {}) => ({
    id: `guard-${++revision}`,
    revision,
    requestId,
    documentId: "guard-document",
    expiresAt: Date.now() + 60000,
    ...extra,
  });
  const emit = async (type, fields = {}, run = runId, request = requestId) => {
    const seq = await evaluate(
      panel,
      `${fixture}.emit(${JSON.stringify({ runId: run, requestId: request, type, ...fields })})`,
    );
    assert.ok(Number.isInteger(seq), "GUARD_EVENT_SCHEMA");
    await evaluate(panel, `${fixture}.tick();true`);
    await waitFor(
      () => evaluate(panel, `${fixture}.state().cursor===${seq}`),
      3000,
      `GUARD_${type}`,
    );
  };
  const latest = (kind) =>
    `[...document.querySelectorAll('.event-card[data-kind=${kind}]')].at(-1)`;
  const count = () => evaluate(panel, `${fixture}.responses().length`);
  const action = {
    tool: "click_by_ref",
    target_name: "Guard Save",
    approval_scope: "single_step",
  };
  return { fixture, runId, requestId, prompt, emit, latest, count, action };
}
