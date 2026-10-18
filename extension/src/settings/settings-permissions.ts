import { browserPermissions, runtime } from "./settings-browser.js";
export const initializeSettingsPermissions = () => {
  const revokePermissions = document.querySelector<HTMLButtonElement>(
    "#permission-revoke-all",
  );
  const revokeStatus = document.querySelector<HTMLOutputElement>(
    "#permission-revoke-status",
  );
  revokePermissions?.addEventListener("click", () => {
    void runtime
      ?.sendMessage({ kind: "PERMISSION_REVOKE_ALL" })
      .then((response) => {
        if (revokeStatus)
          revokeStatus.value =
            typeof response === "object" &&
            response !== null &&
            (response as { ok?: unknown }).ok === true
              ? "저장된 사이트·도구 승인을 철회했습니다. Chrome 접근 권한은 Chrome 설정에서 별도로 관리하세요."
              : "권한 철회에 실패했습니다.";
      })
      .catch(() => {
        if (revokeStatus) revokeStatus.value = "권한 철회에 실패했습니다.";
      });
  });
  const screenshotPermissionRequest = document.querySelector<HTMLButtonElement>(
    "#screenshot-permission-request",
  );
  const screenshotPermissionStatus = document.querySelector<HTMLOutputElement>(
    "#screenshot-permission-status",
  );
  const screenshotOrigins = { origins: ["<all_urls>"] };
  const refreshScreenshotPermission = async (): Promise<void> => {
    const enabled = await browserPermissions
      ?.contains(screenshotOrigins)
      .catch(() => false);
    if (screenshotPermissionRequest)
      screenshotPermissionRequest.disabled = !browserPermissions || !!enabled;
    if (screenshotPermissionStatus)
      screenshotPermissionStatus.value = enabled
        ? "전체 사이트 접근이 허용되었습니다. 철회는 Chrome 확장 프로그램의 사이트 접근 설정에서 하세요."
        : "모델의 화면 캡처를 사용하려면 전체 사이트 접근 권한을 허용하세요.";
  };
  screenshotPermissionRequest?.addEventListener("click", () => {
    void (async () => {
      if (!browserPermissions || !screenshotPermissionRequest) return;
      screenshotPermissionRequest.disabled = true;
      try {
        const changed = await browserPermissions.request(screenshotOrigins);
        if (!changed && screenshotPermissionStatus)
          screenshotPermissionStatus.value =
            "화면 캡처 권한이 허용되지 않았습니다.";
        await refreshScreenshotPermission();
      } catch {
        if (screenshotPermissionStatus)
          screenshotPermissionStatus.value =
            "화면 캡처 권한을 요청하지 못했습니다.";
        await refreshScreenshotPermission();
      }
    })();
  });
  void refreshScreenshotPermission();
  const contentRecoveryEnable = document.querySelector<HTMLInputElement>(
    "#content-recovery-enable",
  );
  const contentRecoveryStatus = document.querySelector<HTMLOutputElement>(
    "#content-recovery-status",
  );
  const refreshContentRecoveryPermission = async (): Promise<void> => {
    const enabled = await browserPermissions
      ?.contains({ permissions: ["scripting"] })
      .catch(() => false);
    if (contentRecoveryEnable) {
      contentRecoveryEnable.checked = enabled ?? false;
      contentRecoveryEnable.disabled = !browserPermissions;
    }
    if (contentRecoveryStatus)
      contentRecoveryStatus.value = enabled
        ? "자동 복구가 허용되었습니다."
        : "연결이 끊긴 페이지를 새로고침 없이 복구하려면 권한을 허용하세요.";
  };
  contentRecoveryEnable?.addEventListener("change", () => {
    void (async () => {
      if (!browserPermissions || !contentRecoveryEnable) return;
      contentRecoveryEnable.disabled = true;
      try {
        const changed = contentRecoveryEnable.checked
          ? await browserPermissions.request({ permissions: ["scripting"] })
          : await browserPermissions.remove({ permissions: ["scripting"] });
        if (!changed && contentRecoveryStatus)
          contentRecoveryStatus.value = contentRecoveryEnable.checked
            ? "자동 복구 권한이 허용되지 않았습니다."
            : "자동 복구 권한을 해제하지 못했습니다.";
        await refreshContentRecoveryPermission();
      } catch {
        if (contentRecoveryStatus)
          contentRecoveryStatus.value = "자동 복구 권한을 변경하지 못했습니다.";
        await refreshContentRecoveryPermission();
      }
    })();
  });
  void refreshContentRecoveryPermission();
};
