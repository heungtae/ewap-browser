import { validActCompletion } from "../contracts/act-completion.js";

/** Shared presentation for live events and restored request status. */
export const actCompletionView = (completion?: unknown) => {
  if (
    !validActCompletion(completion) ||
    (completion.action_outcome === "FAILED" &&
      completion.goal_status !== "checking")
  )
    return undefined;
  if (completion.action_outcome === "UNKNOWN")
    return {
      message:
        completion.goal_status === "checking"
          ? "현재 상태를 추가로 확인하고 있습니다."
          : "작업 결과를 확인하지 못했습니다. 현재 상태를 확인해 주세요.",
      active: completion.goal_status === "checking",
    };
  const messages = {
    checking: "동작은 완료했습니다. 화면을 확인하고 있습니다.",
    completed: "요청한 목표의 완료를 확인했습니다.",
    incomplete: "동작은 완료했으며 목표에 남은 작업이 있습니다.",
    unknown: "동작은 완료했습니다. 최종 화면 확인이 필요합니다.",
  };
  return {
    message:
      completion.goal_status === "checking" &&
      completion.action_outcome !== "VERIFIED"
        ? "현재 상태를 추가로 확인하고 있습니다."
        : messages[completion.goal_status],
    active: completion.goal_status === "checking",
  };
};
