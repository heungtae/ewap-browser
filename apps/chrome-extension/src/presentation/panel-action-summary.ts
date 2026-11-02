import type { PanelAction } from "@contextpilot/shared/bridge";
export const actionSummary = (action: PanelAction): string =>
  action.tool === "submit_plan"
    ? `${action.target_name} 계획을 검토해 주세요. 승인 후에도 각 동작의 실행 승인과 권한 확인이 필요합니다. ${action.approval_reason ?? ""}`
    : (action.workflow_title
        ? action.workflow_title +
          " (" +
          action.workflow_step +
          "/" +
          action.workflow_total +
          "): "
        : "") +
      (action.suggested_value === undefined
        ? action.target_name + " 작업을 제안했습니다."
        : action.tool === "propose_select_option"
          ? action.target_name +
            "에 '" +
            action.suggested_value +
            "' 선택을 제안했습니다."
          : action.target_name +
            "에 '" +
            action.suggested_value +
            "' 입력을 제안했습니다. 승인하면 추가 입력 없이 바로 입력됩니다." +
            (action.suggested_value_truncated === true
              ? " (앞 " +
                [...action.suggested_value].length +
                "자만 표시되며 전체 " +
                (action.suggested_value_length ??
                  [...action.suggested_value].length) +
                "자 중 뒷부분이 생략됐습니다." +
                (action.suggested_value_tail !== undefined
                  ? " 뒷부분 '" + action.suggested_value_tail + "'"
                  : "") +
                (action.suggested_value_digest !== undefined
                  ? " · 값 지문 " + action.suggested_value_digest
                  : "") +
                ". 끝까지 확인하고 승인하세요.)"
              : "")) +
      (action.approval_scope === "session"
        ? " 한 번 승인하면 안전한 후속 단계도 계속 진행합니다."
        : " 이번 단계만 실행합니다." +
          (action.approval_reason
            ? " LLM 판단: " + action.approval_reason
            : ""));
