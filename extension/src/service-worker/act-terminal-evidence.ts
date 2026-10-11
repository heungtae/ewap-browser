import type { ActCompletion } from "../contracts/act-completion.js";
import { isErrorCode } from "../contracts/error-codes.js";
import type { AuditEvent } from "../security/audit.js";
import type { Run } from "../state/run-coordinator.js";

type Outcome = "VERIFIED" | "FAILED" | "UNKNOWN" | "CANCELLED";
type Dependencies = {
  has(runId: string): boolean;
  terminal(runId: string): boolean;
  publish(
    runId: string,
    event: {
      type: "run_terminal";
      outcome: Outcome;
      code?: string;
      completion?: ActCompletion;
    },
  ): void;
  evidence(event: AuditEvent): Promise<unknown>;
};

export const createActTerminalPublisher =
  (dependencies: Dependencies) =>
  (
    run: Run,
    outcome: Outcome,
    code?: string,
    completion?: ActCompletion,
  ): void => {
    if (!dependencies.has(run.id) || dependencies.terminal(run.id)) return;
    dependencies.publish(run.id, {
      type: "run_terminal",
      outcome,
      ...(completion ? { completion } : {}),
      ...(code ? { code } : {}),
    });
    void dependencies
      .evidence({
        event: "terminal",
        run_id: run.id,
        outcome,
        ...(isErrorCode(code) ? { code } : {}),
      })
      .catch(() => undefined);
  };
