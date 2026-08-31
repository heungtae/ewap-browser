import type { PermissionManager } from "../policy/permission-manager.js";
import type { Run } from "../state/run-coordinator.js";
import type { BrowserSender } from "./browser-api.js";
import { createActReviewMessageHandler } from "./act-review-message-handler.js";
import type { ActSession } from "./act-session-types.js";
import {
  createStartActMessageHandler,
  type StartActRequest,
} from "./start-act-message-handler.js";
import type { ServiceCoordinator } from "./coordinator.js";

type Dependencies = {
  isPanelSender(sender: BrowserSender): boolean;
  sessions: Map<string, ActSession>;
  coordinator: ServiceCoordinator;
  permissions: PermissionManager;
  publishTerminal(
    run: Run,
    outcome: "VERIFIED" | "FAILED" | "UNKNOWN" | "CANCELLED",
    code?: string,
  ): void;
  submit(session: ActSession, value: string): Promise<Record<string, unknown>>;
  confirm(
    session: ActSession,
    confirmationId: string,
    confirmationNonce: string,
  ): Promise<Record<string, unknown>>;
  approve(session: ActSession): Promise<Record<string, unknown>>;
  startFixture(
    request: StartActRequest,
    respond: (response: unknown) => void,
  ): void;
  safeFailure(code: string): Record<string, unknown>;
};

export const createActDomainHandlers = (dependencies: Dependencies) => {
  const review = createActReviewMessageHandler({
    isPanelSender: dependencies.isPanelSender,
    session: (id) => dependencies.sessions.get(id),
    reject(session) {
      const actSession = session as ActSession;
      const run = actSession.runId
        ? dependencies.coordinator.runs.byId(actSession.runId)
        : undefined;
      if (run && run.phase !== "TERMINAL") {
        dependencies.coordinator.runs.terminal(run.id, "CANCELLED");
        dependencies.publishTerminal(run, "CANCELLED");
      }
      dependencies.permissions.endRun(actSession.id);
      dependencies.sessions.delete(actSession.id);
    },
    submitValue: (session, value) =>
      dependencies.submit(session as ActSession, value),
    confirm: (session, id, nonce) =>
      dependencies.confirm(session as ActSession, id, nonce),
    approve: (session) => dependencies.approve(session as ActSession),
    safeFailure: dependencies.safeFailure,
  });
  const start = createStartActMessageHandler({
    isPanelSender: dependencies.isPanelSender,
    start: dependencies.startFixture,
    safeFailure: dependencies.safeFailure,
  });
  return { review, start };
};
