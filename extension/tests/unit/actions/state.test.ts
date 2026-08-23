import { describe, expect, it } from "vitest";
import {
  ValueSlots,
  type SlotBinding,
} from "../../../src/state/value-slots.js";
import {
  ConfirmationStore,
  type ConfirmationBinding,
} from "../../../src/state/confirmation.js";
import { RunCoordinator } from "../../../src/state/run-coordinator.js";
const binding: SlotBinding = {
  run_id: "run",
  tab_id: 1,
  frame_id: 0,
  document_epoch: "epoch",
  profile_id: "profile",
  profile_version: 1,
  tool: "set_text_by_ref",
  ref_id: "ref",
  value_kind: "text",
};
describe("one-time action state", () => {
  it("given_submitted_slot_when_submitted_twice_then_denied", () => {
    const slots = new ValueSlots();
    const slot = slots.create(binding, 0);
    slots.submit(slot.id, binding, "value", 1);
    expect(() => slots.submit(slot.id, binding, "value", 2)).toThrow(
      "VALUE_BINDING_INVALID",
    );
  });
  it("given_cross_tab_confirmation_when_consuming_then_denied", () => {
    const store = new ConfirmationStore();
    const bind: ConfirmationBinding = {
      run_id: "run",
      tab_context: "tab",
      document_epoch: "epoch",
      intent_digest: "digest",
      session_binding_id: "session",
    };
    const token = store.issue(bind, 0);
    expect(() =>
      store.consume(
        token.id,
        token.nonce,
        { ...bind, tab_context: "other" },
        1,
      ),
    ).toThrow("CONFIRMATION_INVALID");
  });
  it("given_cancelled_run_when_reusing_value_or_confirmation_then_denied", () => {
    const runs = new RunCoordinator();
    const run = runs.start(1, 0, "epoch", "act");
    const slot = runs.values.create({ ...binding, run_id: run.id });
    const confirmation: ConfirmationBinding = {
      run_id: run.id,
      tab_context: run.tabContext,
      document_epoch: run.documentEpoch,
      intent_digest: "digest",
      session_binding_id: "session",
    };
    const token = runs.confirmations.issue(confirmation);
    runs.cancel(1);
    expect(() =>
      runs.values.submit(slot.id, { ...binding, run_id: run.id }, "value"),
    ).toThrow("VALUE_BINDING_INVALID");
    expect(() =>
      runs.confirmations.consume(token.id, token.nonce, confirmation),
    ).toThrow("CONFIRMATION_INVALID");
  });
  it("given_dispatched_navigation_when_verifying_then_marks_the_run_without_authorizing_another_action", () => {
    const runs = new RunCoordinator();
    const run = runs.start(1, 0, "epoch", "act");
    runs.transition(run.id, "EXECUTING");

    runs.transition(run.id, "VERIFYING_NAVIGATION");

    expect(runs.byId(run.id)?.phase).toBe("VERIFYING_NAVIGATION");
  });
});
