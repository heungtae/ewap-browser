import type { ErrorCode, Outcome } from "../contracts/types.js";
export const userMessage: Record<ErrorCode, string> = {
  INVALID_ARGUMENT: "작업 요청 형식이 올바르지 않습니다.",
  DOCUMENT_NOT_REGISTERED:
    "페이지가 다시 준비되는 중입니다. 잠시 후 다시 확인해 주세요.",
  POLICY_DENIED: "회사 정책상 이 작업을 할 수 없습니다.",
  ORIGIN_NOT_ALLOWED: "이 사이트에서는 사용할 수 없습니다.",
  PROFILE_UNAVAILABLE: "이 페이지의 업무 프로필을 확인할 수 없습니다.",
  UNKNOWN_PROFILE:
    "등록된 업무 프로필이 없어 읽기 전용으로만 사용할 수 있습니다.",
  TARGET_STALE: "페이지가 변경되어 대상을 다시 확인해야 합니다.",
  TARGET_NOT_ACTIONABLE: "현재 대상에 작업을 수행할 수 없습니다.",
  VALUE_BINDING_INVALID: "입력값이 만료되었거나 현재 작업과 일치하지 않습니다.",
  CONFIRMATION_INVALID: "확인이 만료되었거나 변경 내용이 달라졌습니다.",
  AI_HUB_NOT_CONFIGURED: "AI Hub 연결이 아직 구성되지 않았습니다.",
  TRANSPORT_FAILED: "AI Hub 연결에 실패했습니다.",
  PAYLOAD_LIMIT_EXCEEDED: "페이지 정보가 허용 범위를 초과했습니다.",
  STORAGE_BOUNDARY_UNAVAILABLE:
    "브라우저 저장소 보안 경계를 설정할 수 없습니다.",
  PAGE_SCOPE_STALE: "페이지가 변경되어 새 페이지 정보를 확인해야 합니다.",
  THREAD_LIMIT_REACHED: "이 대화에서 열 수 있는 탭 수에 도달했습니다.",
  CHAT_STORAGE_QUOTA_EXCEEDED: "이 탭의 대화 저장 한도를 초과했습니다.",
  SESSION_STREAM_BUSY: "다른 탭에서 응답을 생성하고 있습니다.",
  CONTEXT_BUDGET_EXCEEDED: "요청이 대화 문맥 한도를 초과했습니다.",
  INPUT_REDACTED: "민감한 정보가 포함되어 요청을 보낼 수 없습니다.",
  TRANSFER_STALE: "전달 대상 페이지가 변경되어 대화를 이어갈 수 없습니다.",
  INTERNAL_FAILURE: "작업을 안전하게 완료할 수 없습니다.",
  BUSINESS_MCP_NOT_CONFIGURED: "업무 데이터 연결이 구성되지 않았습니다.",
  BUSINESS_MCP_UNAVAILABLE: "업무 데이터 연결을 사용할 수 없습니다.",
  BUSINESS_MCP_TIMEOUT: "업무 데이터 응답 시간이 초과되었습니다.",
  BUSINESS_MCP_PROTOCOL_ERROR:
    "업무 데이터 응답을 안전하게 확인할 수 없습니다.",
  PERMISSION_REQUIRED: "이 사이트에서 해당 작업을 허용해야 합니다.",
  CDP_UNAVAILABLE: "신뢰 입력 기능을 사용할 수 없습니다.",
  CDP_CONFLICT: "다른 디버거가 연결되어 신뢰 입력을 실행할 수 없습니다.",
  CDP_COMMAND_NOT_ALLOWED: "허용되지 않은 브라우저 입력 요청입니다.",
  CDP_CLEANUP_FAILED:
    "브라우저 입력 연결을 정리하지 못해 이 탭의 작업을 중단했습니다.",
  VISION_CAPTURE_UNAVAILABLE:
    "현재 페이지에서 screenshot을 안전하게 캡처할 수 없습니다.",
  PAGE_TEXT_UNAVAILABLE: "읽을 수 있는 본문 텍스트를 찾지 못했습니다.",
  PROVIDER_PLUGIN_NOT_FOUND: "선택한 provider plugin을 찾을 수 없습니다.",
  PROVIDER_PLUGIN_INCOMPATIBLE:
    "provider plugin 버전이 현재 확장과 호환되지 않습니다.",
  PROVIDER_PLUGIN_FAILED: "provider plugin 요청을 처리하지 못했습니다.",
  PROVIDER_NOT_CONFIGURED: "사용할 provider를 먼저 설정해야 합니다.",
  PROVIDER_AUTH_FAILED: "provider API key 또는 header를 확인해 주세요.",
  PROVIDER_UNAVAILABLE: "provider에 연결할 수 없습니다.",
};
export const timelineToolLabel = (tool: string): string =>
  (
    ({
      click_by_ref: "클릭",
      set_text_by_ref: "텍스트 입력",
      select_option_by_ref: "옵션 선택",
      set_checked_by_ref: "선택 상태 변경",
      press_key_by_ref: "키 입력",
    }) as Record<string, string>
  )[tool] ?? "페이지 작업";
export type FailureHelp = {
  guidance: string;
  openSettings?: boolean;
};
export const failureHelp = (code?: string): FailureHelp => {
  switch (code) {
    case "PROVIDER_NOT_CONFIGURED":
    case "PROVIDER_PLUGIN_NOT_FOUND":
    case "PROVIDER_PLUGIN_INCOMPATIBLE":
      return {
        guidance:
          "AI 설정에서 사용할 provider와 모델을 선택한 뒤 다시 시도해 주세요.",
        openSettings: true,
      };
    case "PROVIDER_AUTH_FAILED":
      return {
        guidance:
          "AI 설정에서 API key와 인증 header를 확인한 뒤 연결 테스트를 실행해 주세요.",
        openSettings: true,
      };
    case "PROVIDER_UNAVAILABLE":
    case "PROVIDER_PLUGIN_FAILED":
    case "TRANSPORT_FAILED":
      return {
        guidance:
          "AI 설정에서 연결 테스트를 실행하세요. 계속되면 endpoint, 실행 중인 provider, 선택 모델을 확인해 주세요.",
        openSettings: true,
      };
    case "DOCUMENT_NOT_REGISTERED":
    case "TARGET_STALE":
      return {
        guidance: "현재 페이지를 새로고침한 뒤 같은 요청을 다시 시도해 주세요.",
      };
    case "PERMISSION_REQUIRED":
      return {
        guidance:
          "주소 표시줄의 확장 프로그램 권한에서 이 사이트 사용을 허용한 뒤 다시 시도해 주세요.",
      };
    default:
      return {
        guidance:
          "같은 문제가 반복되면 확장을 다시 로드한 뒤 다시 시도해 주세요.",
      };
  }
};
export const terminalState = (
  outcome: Outcome,
  code?: ErrorCode,
): { outcome: Outcome; message?: string; retry: false } => ({
  outcome,
  ...(code ? { message: userMessage[code] } : {}),
  retry: false,
});
