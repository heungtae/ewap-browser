import { runtime } from "./settings-browser.js";
import {
  applyApprovalSettings,
  readApprovalSettings,
} from "./approval-settings.js";
import { markFormSaved } from "./form-feedback.js";
export const initializeAgentPreferences = () => {
  const agentPreferencesForm = document.querySelector<HTMLFormElement>(
    "#agent-preferences-form",
  );
  const agentPreferencesStatus = document.querySelector<HTMLOutputElement>(
    "#agent-preferences-status",
  );
  const preferenceField = (
    name: string,
  ): HTMLInputElement | HTMLSelectElement => {
    const element = agentPreferencesForm?.elements.namedItem(name);
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement
      )
    )
      throw new Error("agent preference field missing");
    return element;
  };
  const applyPreferences = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    const preferences = value as Record<string, unknown>;
    for (const name of [
      "permission_mode",
      "default_read_scope",
      "screenshot_policy",
    ]) {
      const field = preferenceField(name);
      if (typeof preferences[name] === "string")
        field.value = preferences[name];
    }
    for (const name of [
      "group_tools_in_timeline",
      "show_tool_debug_details",
      "page_method_enabled",
    ]) {
      const field = preferenceField(name);
      if (
        field instanceof HTMLInputElement &&
        typeof preferences[name] === "boolean"
      )
        field.checked = preferences[name];
    }
    applyApprovalSettings(preferences);
  };
  void runtime
    ?.sendMessage({ kind: "AGENT_PREFERENCES_GET" })
    .then((response) => {
      if (
        typeof response === "object" &&
        response !== null &&
        (response as { ok?: unknown }).ok
      )
        applyPreferences((response as { preferences?: unknown }).preferences);
      if (
        (response as { approval_settings_error?: unknown })
          ?.approval_settings_error &&
        agentPreferencesStatus
      )
        agentPreferencesStatus.value =
          "승인 설정을 복구해야 합니다. 자동 승인은 비활성화되어 있습니다. 설정을 확인하고 다시 저장하세요.";
    });
  agentPreferencesForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void (async () => {
      if (!runtime) throw new Error("runtime unavailable");
      const acknowledgement = preferenceField("skip_acknowledgement");
      const response = await runtime.sendMessage({
        kind: "AGENT_PREFERENCES_SAVE",
        payload: {
          preferences: {
            permission_mode: preferenceField("permission_mode").value,
            approval_policy: readApprovalSettings(),
            default_read_scope: preferenceField("default_read_scope").value,
            screenshot_policy: preferenceField("screenshot_policy").value,
            page_method_enabled: (
              preferenceField("page_method_enabled") as HTMLInputElement
            ).checked,
            group_tools_in_timeline: (
              preferenceField("group_tools_in_timeline") as HTMLInputElement
            ).checked,
            show_tool_debug_details: (
              preferenceField("show_tool_debug_details") as HTMLInputElement
            ).checked,
          },
          acknowledgement:
            preferenceField("permission_mode").value ===
            "skip_all_permission_checks"
              ? "권한 질문 생략"
              : acknowledgement.value,
        },
      });
      if (
        !(
          typeof response === "object" &&
          response !== null &&
          (response as { ok?: unknown }).ok
        )
      ) {
        const code =
          typeof response === "object" &&
          response !== null &&
          typeof (response as { code?: unknown }).code === "string"
            ? (response as { code: string }).code
            : "UNKNOWN";
        throw new Error(code);
      }
      acknowledgement.value = "";
      applyPreferences((response as { preferences?: unknown }).preferences);
      markFormSaved(agentPreferencesForm);
      if (agentPreferencesStatus)
        agentPreferencesStatus.value =
          "작업 설정을 저장했습니다. 진행 중인 작업은 취소되었습니다.";
    })().catch((error: unknown) => {
      if (agentPreferencesStatus)
        agentPreferencesStatus.value =
          error instanceof Error && error.message === "INVALID_ARGUMENT"
            ? "설정이 변경되었거나 유효하지 않습니다. 다시 불러온 후 저장하세요."
            : "Browser Agent 설정을 저장하지 못했습니다.";
    });
  });
};
