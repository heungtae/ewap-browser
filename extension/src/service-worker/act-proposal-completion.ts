import type { ActCompletion } from "../contracts/act-completion.js";
import { checkingCompletion } from "./act-goal-finalizer.js";
import { recordActExecution } from "./act-execution-feedback.js";
import type { ChatEventPayload } from "../contracts/chat-events.js";
import type { Run } from "../state/run-coordinator.js";
import type { ActProposal, ActSession } from "./act-session-types.js";

type Outcome = "FAILED" | "UNKNOWN" | "VERIFIED";
type Execution = Record<string, unknown>;
type Dependencies = {
  publish(runId: string, event: ChatEventPayload): void;
  publishTerminal(
    run: Run,
    outcome: Outcome,
    code?: string,
    completion?: ActCompletion,
  ): void;
  continueWorkflow(
    session: ActSession,
    proposal: ActProposal,
  ): Promise<Record<string, unknown>>;
  endSession(session: ActSession): void;
};

export const completeActProposal = async (
  dependencies: Dependencies,
  session: ActSession,
  run: Run,
  proposal: ActProposal,
  executed: Execution,
  summaries: { success: string; failure: string; unknown?: string },
): Promise<Record<string, unknown>> => {
  const evidence = recordActExecution(session, proposal, executed);
  dependencies.publish(run.id, {
    type: "tool_finished",
    tool_use_id: proposal.toolCallId,
    result: {
      outcome: evidence.outcome,
      summary:
        evidence.outcome === "VERIFIED"
          ? summaries.success
          : evidence.outcome === "UNKNOWN"
            ? (summaries.unknown ?? summaries.failure)
            : summaries.failure,
      ...(evidence.code ? { code: evidence.code } : {}),
    },
  });
  // End this attempt's UI run while keeping the request in checking state.
  // Without its terminal event the Panel rejects the next assessment run.
  dependencies.publishTerminal(
    run,
    evidence.outcome,
    undefined,
    checkingCompletion(session),
  );
  return dependencies.continueWorkflow(session, proposal);
};
