import type {
  ActionIntent,
  CompletionContract,
  ModelActionProposal,
  MutationTool,
  Role,
  VerifierPredicate,
} from "../contracts/types.js";
import type { SlotBinding } from "./value-slots.js";

export type ActionDefinition = {
  tool: MutationTool;
  effect: "local-ui-only" | "server-side";
  risk: "R1" | "R2";
  eligibleRoles: readonly Role[];
  verifier: VerifierPredicate;
  completion?: CompletionContract;
};
export type MutationTarget = {
  refId: string;
  role: Role;
  name?: string;
  visible: boolean;
  enabled: boolean;
  sensitive: boolean;
  stale: boolean;
};
export type AwaitingValue = {
  state: "AWAITING_VALUE";
  valueSlotId: string;
  valueKind: "text" | "option";
};
export type AwaitingConfirmation = {
  state: "AWAITING_CONFIRMATION";
  confirmationId: string;
  confirmationNonce: string;
};
export type ReadyExecution = {
  state: "READY_TO_EXECUTE";
  intent: ActionIntent;
  value?: string;
};
export type PendingMutation = {
  intent: ActionIntent;
  slot?: SlotBinding & { id: string };
  value?: string;
  sessionBindingId?: string;
};
export type MutationProposal = ModelActionProposal;
