const messages: Record<string, string> = {
  INVALID_ARGUMENT:
    "설정 값이 올바르지 않거나 다른 창에서 변경되었습니다. 입력값을 확인하고 페이지를 다시 열어 주세요.",
  PROVIDER_NOT_CONFIGURED:
    "Provider를 저장하고 ‘이 Provider 사용’을 켠 뒤 적용하세요.",
  PROVIDER_UNAVAILABLE:
    "모델에 연결하지 못했습니다. API 주소·인증 정보·모델 이름을 확인하세요.",
  PROVIDER_DISABLED: "Provider 연결 설정에서 사용을 켜고 저장하세요.",
  POLICY_DENIED: "현재 회사 정책 또는 권한 설정에서 허용하지 않는 작업입니다.",
  TIMEOUT: "응답 시간이 초과되었습니다. 연결 상태를 확인하고 다시 시도하세요.",
};
export const settingsErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error))
    return "작업에 실패했습니다. 다시 시도해 주세요.";
  return messages[error.message] ?? error.message;
};
