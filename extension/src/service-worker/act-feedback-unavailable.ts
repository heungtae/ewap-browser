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
  const message =
    "실행 결과는 기록됐지만 안전한 최신 관찰을 확보하지 못했습니다. origin·탭·페이지 변경 또는 관찰 실패로 목표 완료는 UNKNOWN입니다. 이전 대상이나 승인을 재사용하지 않습니다.";
  dependencies.publish(run.id, {
    type: "run_started",
    mode: "act",
    permission_mode: dependencies.preferences().permission_mode,
  });
  dependencies.publish(run.id, { type: "assistant_delta", text: message });
  dependencies.coordinator.runs.terminal(run.id, "UNKNOWN", "PAGE_SCOPE_STALE");
  dependencies.publish(run.id, { type: "activity_finished", stage: "FAILED" });
  dependencies.publish(run.id, {
    type: "run_terminal",
    outcome: "UNKNOWN",
    code: "PAGE_SCOPE_STALE",
  });
  dependencies.endSession(session);
  return {
    ok: true,
    outcome: "UNKNOWN",
    state: "UNKNOWN",
    terminal: "UNKNOWN",
    code: "PAGE_SCOPE_STALE",
    message,
  };
};
