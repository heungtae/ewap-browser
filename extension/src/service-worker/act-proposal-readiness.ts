import type { ModelActionProposal } from "../contracts/types.js";
import type { Role } from "../contracts/core-types.js";
import { digestCanonical } from "../security/canonical.js";
import type {
  ActionDefinition,
  ReadyExecution,
} from "../state/mutation-coordinator.js";
import type { Run } from "../state/run-coordinator.js";
import type {
  ChatActionView,
  ChatEventPayload,
} from "../contracts/chat-events.js";
import type { ServiceCoordinator } from "./coordinator.js";
import type { ActProposal, ActSession } from "./act-session-types.js";

type Target = {
  enabled: boolean;
  ref_id: string;
  role: Role;
  state: unknown;
  visible: boolean;
};
type Dependencies = {
  actionView(session: ActSession, proposal: ActProposal): ChatActionView;
  coordinator: ServiceCoordinator;
  publish(runId: string, event: ChatEventPayload): void;
};
type Prepared =
  | { ready: ReadyExecution }
  | { response: Record<string, unknown> };

export const prepareActProposal = (
  dependencies: Dependencies,
  session: ActSession,
  run: Run,
  proposal: ActProposal,
  target: Target,
): Prepared => {
  const definition: ActionDefinition = {
    tool: proposal.definition.tool,
    effect: proposal.definition.effect,
    risk: proposal.definition.risk,
    eligibleRoles: proposal.definition.eligible_roles,
    verifier: {
      ...proposal.definition.verifier,
      pre_state_digest: digestCanonical(target.state),
      required_changes: proposal.definition.verifier.required_changes.map(
        (change) => ({
          ...change,
          ...(change.ref_id === "$target" ? { ref_id: proposal.refId } : {}),
        }),
      ),
    },
  };
  const next = dependencies.coordinator.mutations.propose(
    run,
    {
      tool: proposal.tool,
      target: "approved-profile-target",
      ...(proposal.argument ? { argument: proposal.argument } : {}),
    } as ModelActionProposal,
    {
      refId: proposal.refId,
      role: target.role,
      visible: target.visible,
      enabled: target.enabled,
      sensitive: false,
      stale: false,
    },
    session.profile,
    definition,
  );
  if (next.state === "AWAITING_VALUE") {
    if (proposal.value) {
      const afterValue = dependencies.coordinator.mutations.submitValue(
        run,
        next.valueSlotId,
        proposal.value,
      );
      return afterValue.state === "READY_TO_EXECUTE"
        ? { ready: dependencies.coordinator.mutations.executeR1(run) }
        : { response: { ok: false, code: "CONFIRMATION_INVALID" } };
    }
    session.awaitingValue = {
      runId: run.id,
      valueSlotId: next.valueSlotId,
      valueKind: next.valueKind,
    };
    dependencies.publish(run.id, {
      type: "value_required",
      action: dependencies.actionView(session, proposal),
      value_kind: next.valueKind,
    });
    return {
      response: {
        ok: true,
        state: "VALUE_REQUIRED",
        session_id: session.id,
        proposal_id: proposal.id,
        value_slot_id: next.valueSlotId,
        value_kind: next.valueKind,
        target_name: proposal.targetName,
      },
    };
  }
  if (next.state === "READY_TO_EXECUTE")
    return { ready: dependencies.coordinator.mutations.executeR1(run) };
  if (next.state === "AWAITING_CONFIRMATION") {
    session.awaitingConfirmation = {
      runId: run.id,
      confirmationId: next.confirmationId,
      confirmationNonce: next.confirmationNonce,
    };
    dependencies.publish(run.id, {
      type: "confirmation_required",
      action: dependencies.actionView(session, proposal),
      confirmation_id: next.confirmationId,
      confirmation_nonce: next.confirmationNonce,
    });
    return {
      response: {
        ok: true,
        state: "CONFIRMATION_REQUIRED",
        session_id: session.id,
        proposal_id: proposal.id,
      },
    };
  }
  return { response: { ok: false, code: "CONFIRMATION_INVALID" } };
};
