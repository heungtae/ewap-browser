import { fail } from "../security/validation.js";
import type { ReadyExecution } from "../state/mutation-coordinator.js";
import type { Run } from "../state/run-coordinator.js";
import type { ServiceCoordinator } from "./coordinator.js";
import type { ActProposal, ActSession } from "./act-session-types.js";

type Complete = (
  session: ActSession,
  run: Run,
  proposal: ActProposal,
  executed: Record<string, unknown>,
  summaries: { success: string; failure: string },
) => Promise<Record<string, unknown>>;
type Dependencies = {
  coordinator: ServiceCoordinator;
  getRun(runId: string): Run | undefined;
  execute(
    run: Run,
    ready: ReadyExecution,
    origin: string,
  ): Promise<Record<string, unknown>>;
  complete: Complete;
};

export const createActProposalFollowup = (dependencies: Dependencies) => {
  const submitValue = async (
    session: ActSession,
    value: string,
  ): Promise<Record<string, unknown>> => {
    const awaiting = session.awaitingValue;
    const proposal = session.proposal;
    const run = awaiting ? dependencies.getRun(awaiting.runId) : undefined;
    if (
      !awaiting ||
      !proposal ||
      !run ||
      run.phase === "TERMINAL" ||
      awaiting.valueKind !== "text" ||
      value.length === 0 ||
      value.length > 16_384
    )
      return fail("VALUE_BINDING_INVALID");
    const next = dependencies.coordinator.mutations.submitValue(
      run,
      awaiting.valueSlotId,
      value,
    );
    if (next.state !== "READY_TO_EXECUTE") return fail("CONFIRMATION_INVALID");
    delete session.awaitingValue;
    return dependencies.complete(
      session,
      run,
      proposal,
      await dependencies.execute(
        run,
        dependencies.coordinator.mutations.executeR1(run),
        session.origin,
      ),
      {
        success: "입력 결과를 확인했습니다.",
        failure: "입력 작업을 완료하지 못했습니다.",
      },
    );
  };
  const confirmProposal = async (
    session: ActSession,
    confirmationId: string,
    confirmationNonce: string,
  ): Promise<Record<string, unknown>> => {
    const awaiting = session.awaitingConfirmation;
    const proposal = session.proposal;
    const run = awaiting ? dependencies.getRun(awaiting.runId) : undefined;
    if (
      !awaiting ||
      !proposal ||
      !run ||
      run.phase !== "AWAITING_CONFIRMATION" ||
      awaiting.confirmationId !== confirmationId ||
      awaiting.confirmationNonce !== confirmationNonce
    )
      return fail("CONFIRMATION_INVALID");
    delete session.awaitingConfirmation;
    return dependencies.complete(
      session,
      run,
      proposal,
      await dependencies.execute(
        run,
        dependencies.coordinator.mutations.confirm(
          run,
          confirmationId,
          confirmationNonce,
        ),
        session.origin,
      ),
      {
        success: "확인된 작업 결과를 검증했습니다.",
        failure: "확인 작업을 완료하지 못했습니다.",
      },
    );
  };
  return { confirmProposal, submitValue };
};
