interface Permissions {
  contains(value: { origins: string[] }): Promise<boolean>;
  request(value: { origins: string[] }): Promise<boolean>;
}
export function initializeBrowserPermissions(permissions?: Permissions) {
  const button = document.querySelector<HTMLButtonElement>(
    "#screenshot-permission-request",
  );
  const status = document.querySelector<HTMLOutputElement>(
    "#screenshot-permission-status",
  );
  if (!button || !status) return;
  const origins = { origins: ["<all_urls>"] };
  const refresh = async () => {
    const granted = await permissions?.contains(origins).catch(() => false);
    button.disabled = !permissions || !!granted;
    status.value = granted
      ? "전체 사이트 접근이 허용되었습니다. 철회는 Chrome 확장 프로그램의 사이트 접근 설정에서 하세요."
      : "모델의 화면 캡처를 사용하려면 전체 사이트 접근 권한을 허용하세요.";
  };
  button.addEventListener("click", () => {
    if (!permissions || button.disabled) return;
    button.disabled = true;
    void permissions
      .request(origins)
      .then(refresh)
      .catch(() => {
        button.disabled = false;
        status.value = "화면 캡처 권한을 요청하지 못했습니다.";
      });
  });
  void refresh();
  const recovery = document.querySelector<HTMLInputElement>(
    "#content-recovery-enable",
  );
  const recoveryStatus = document.querySelector<HTMLOutputElement>(
    "#content-recovery-status",
  );
  if (recovery) recovery.disabled = true;
  if (recoveryStatus)
    recoveryStatus.value =
      "현재 Backend 연결은 페이지 자동 복구를 지원하지 않습니다.";
  const revoke = document.querySelector<HTMLButtonElement>(
    "#permission-revoke-all",
  );
  if (revoke)
    revoke.addEventListener("click", () => {
      const output = document.querySelector<HTMLOutputElement>(
        "#permission-revoke-status",
      );
      if (output)
        output.value = "Backend 작업 승인 저장소가 아직 연결되지 않았습니다.";
    });
}
