import { describe, expect, it } from "vitest";
import type { VerifierPredicate } from "../../../src/contracts/types.js";
import {
  MutationCoordinator,
  type ActionDefinition,
} from "../../../src/state/mutation-coordinator.js";
import { RunCoordinator } from "../../../src/state/run-coordinator.js";

const verifier: VerifierPredicate = {
  kind: "semantic-state-transition",
  declaration_id: "checked-v1",
  pre_state_digest: "pre",
  required_changes: [{ ref_id: "target", field: "checked", expected: true }],
};
const textDefinition: ActionDefinition = {
  tool: "set_text_by_ref",
  effect: "local-ui-only",
  risk: "R1",
  eligibleRoles: ["textbox"],
  verifier,
};
const r2Definition: ActionDefinition = {
  tool: "set_checked_by_ref",
  effect: "server-side",
  risk: "R2",
  eligibleRoles: ["checkbox"],
  verifier,
};
const target = {
  refId: "target",
  role: "textbox" as const,
  visible: true,
  enabled: true,
  sensitive: false,
  stale: false,
};
describe("mutation coordinator", () => {
  it("given_text_proposal_when_value_is_submitted_then_slot_is_consumed_only_on_execution", () => {
    const runs = new RunCoordinator();
    const coordinator = new MutationCoordinator(runs);
    const run = runs.start(1, 0, "epoch", "act");
    const awaiting = coordinator.propose(
      run,
      { tool: "set_text_by_ref", target: "model" },
      target,
      { id: "profile", version: 1 },
      textDefinition,
      undefined,
      0,
    );
    if (awaiting.state !== "AWAITING_VALUE")
      throw new Error("expected value state");
    const ready = coordinator.submitValue(
      run,
      awaiting.valueSlotId,
      "operator input",
      1,
    );
    expect(ready.state).toBe("READY_TO_EXECUTE");
    const execution = coordinator.executeR1(run, 2);
    expect(execution.value).toBe("operator input");
    expect(execution.intent.value_binding).toMatchObject({
      value_slot_id: awaiting.valueSlotId,
      value_kind: "text",
    });
    expect(() => coordinator.executeR1(run, 3)).toThrow("POLICY_DENIED");
  });
  it("given_r2_proposal_when_confirmation_is_reused_then_it_is_denied", () => {
    const runs = new RunCoordinator();
    const coordinator = new MutationCoordinator(runs);
    const run = runs.start(1, 0, "epoch", "act");
    const awaiting = coordinator.propose(
      run,
      {
        tool: "set_checked_by_ref",
        target: "model",
        argument: { checked: true },
      },
      { ...target, role: "checkbox" },
      { id: "profile", version: 1 },
      r2Definition,
      "session",
      0,
    );
    if (awaiting.state !== "AWAITING_CONFIRMATION")
      throw new Error("expected confirmation state");
    expect(
      coordinator.confirm(
        run,
        awaiting.confirmationId,
        awaiting.confirmationNonce,
        1,
      ).state,
    ).toBe("READY_TO_EXECUTE");
    expect(() =>
      coordinator.confirm(
        run,
        awaiting.confirmationId,
        awaiting.confirmationNonce,
        2,
      ),
    ).toThrow("CONFIRMATION_INVALID");
  });
  it("given_stale_target_when_proposed_then_it_is_denied_before_slot_creation", () => {
    const runs = new RunCoordinator();
    const coordinator = new MutationCoordinator(runs);
    const run = runs.start(1, 0, "epoch", "act");
    expect(() =>
      coordinator.propose(
        run,
        { tool: "set_text_by_ref", target: "model" },
        { ...target, stale: true },
        { id: "profile", version: 1 },
        textDefinition,
      ),
    ).toThrow("TARGET_STALE");
  });
});
