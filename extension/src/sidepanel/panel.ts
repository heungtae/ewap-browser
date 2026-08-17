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
  PROVIDER_PLUGIN_NOT_FOUND: "선택한 provider plugin을 찾을 수 없습니다.",
  PROVIDER_PLUGIN_INCOMPATIBLE:
    "provider plugin 버전이 현재 확장과 호환되지 않습니다.",
  PROVIDER_PLUGIN_FAILED: "provider plugin 요청을 처리하지 못했습니다.",
  PROVIDER_NOT_CONFIGURED: "사용할 provider를 먼저 설정해야 합니다.",
  PROVIDER_AUTH_FAILED: "provider API key 또는 header를 확인해 주세요.",
  PROVIDER_UNAVAILABLE: "provider에 연결할 수 없습니다.",
};
export const terminalState = (
  outcome: Outcome,
  code?: ErrorCode,
): { outcome: Outcome; message?: string; retry: false } => ({
  outcome,
  ...(code ? { message: userMessage[code] } : {}),
  retry: false,
});
