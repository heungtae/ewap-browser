import { finaliseGoal } from "./act-goal-finalizer.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import type { ActSession } from "./act-session-types.js";

export const unavailableActFeedback = (
  dependencies: ActStepDependencies,
  session: ActSession,
): Record<string, unknown> => {
  const previous = session.runId
    ? dependencies.coordinator.runs.byId(session.runId)
    : undefined;
  if (!previous || session.requestContext?.signal.aborted) {
    dependencies.endSession(session);
    return {
      ok: false,
      outcome: "UNKNOWN",
      terminal: "UNKNOWN",
      code: "PAGE_SCOPE_STALE",
    };
  }
  const run = dependencies.coordinator.runs.start(
    session.tabId,
    previous.frameId,
    previous.documentEpoch,
    "act",
  );
  session.runId = run.id;
  if (session.lastObservationScope)
    dependencies.bindRun(run.id, session.tabId, session.lastObservationScope);
  delete session.plan;
  delete session.pageApiActions;
  delete session.continueAfterApproval;
  dependencies.publish(run.id, {
    type: "run_started",
    mode: "act",
    permission_mode: dependencies.preferences().permission_mode,
  });
  return finaliseGoal({
    dependencies,
    session,
    run,
    status: "unknown",
    summary: "",
    current: false,
    reassessments: 0,
    reason: "OBSERVATION_UNAVAILABLE",
  });
};
