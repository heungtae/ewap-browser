import type { ChatEventPayload } from "../contracts/chat-events.js";
import { ContractError } from "../security/validation.js";
import type { Run } from "../state/run-coordinator.js";
import type { ActSession } from "./act-session-types.js";
import type { ServiceCoordinator } from "./coordinator.js";

type Input = {
  coordinator: ServiceCoordinator;
  publish(runId: string, event: ChatEventPayload): void;
  endSession(session: ActSession): void;
  session: ActSession;
  run: Run;
  error: unknown;
};

export const failActRun = ({
  coordinator,
  publish,
  endSession,
  session,
  run,
  error,
}: Input): void => {
  if (coordinator.runs.byId(run.id)?.phase === "TERMINAL") return;
  const code = error instanceof ContractError ? error.code : "INTERNAL_FAILURE";
  coordinator.runs.terminal(run.id, "FAILED", code);
  publish(run.id, { type: "activity_finished", stage: "FAILED" });
  publish(run.id, { type: "run_terminal", outcome: "FAILED", code });
  endSession(session);
};
