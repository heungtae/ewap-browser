import type { ActionIntent, ModelActionProposal } from "../contracts/types.js";
import type { Run } from "./run-coordinator.js";
import type { SlotBinding } from "./value-slots.js";
import type { ActionDefinition, MutationTarget } from "./mutation-types.js";

export const slotBinding = (
  slot: SlotBinding & { id: string },
): SlotBinding => ({
  run_id: slot.run_id,
  tab_id: slot.tab_id,
  frame_id: slot.frame_id,
  document_epoch: slot.document_epoch,
  profile_id: slot.profile_id,
  profile_version: slot.profile_version,
  tool: slot.tool,
  ref_id: slot.ref_id,
  value_kind: slot.value_kind,
});

export const actionIntent = (
  run: Run,
  proposal: ModelActionProposal,
  target: MutationTarget,
  profile: { id: string; version: number },
  definition: ActionDefinition,
): ActionIntent => {
  const base = {
    tool: proposal.tool,
    run_id: run.id,
    tab_id: run.tabId,
    frame_id: run.frameId,
    document_epoch: run.documentEpoch,
    profile,
    ref_id: target.refId,
    effect: definition.effect,
    verifier: definition.verifier,
    risk: definition.risk,
  };
  return proposal.tool === "set_checked_by_ref" ||
    proposal.tool === "press_key_by_ref"
    ? { ...base, argument: proposal.argument }
    : base;
};
