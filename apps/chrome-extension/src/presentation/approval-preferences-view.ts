import {
  preferenceCategories,
  agentPreferencesSchema,
  defaultAgentPreferences,
  type AgentPreferences,
} from "../../../../packages/shared/src/preferences.js";
const labels = [
  "작업 제안 실행",
  "계획 승인",
  "사이트·도구 사용 권한",
  "중요 작업 추가 확인",
  "페이지 코드 전송·분석",
  "페이지 메서드 반환 자료 전송",
  "화면 전송·분석",
  "스크롤 자료 읽기",
];
export function createPreferencesView(form: HTMLFormElement) {
  let current = defaultAgentPreferences();
  const container = form.querySelector<HTMLElement>("#approval-categories")!;
  const field = (name: string) => {
    const value = form.elements.namedItem(name);
    if (
      !(value instanceof HTMLInputElement || value instanceof HTMLSelectElement)
    )
      throw Error("PREFERENCE_FIELD");
    return value;
  };
  const mode = field("approval_mode");
  for (const [i, category] of preferenceCategories.entries()) {
    const label = document.createElement("label"),
      select = document.createElement("select");
    label.textContent = labels[i]!;
    select.name = `approval_${category}`;
    for (const [value, text] of [
      ["ask", "확인"],
      ["auto", "자동 승인"],
      ["deny", "거부"],
    ]) {
      const option = document.createElement("option");
      option.value = value!;
      option.textContent = text!;
      select.append(option);
    }
    label.append(select);
    container.append(label);
  }
  const render = () => {
    container.hidden = mode.value !== "custom";
    const output = form.querySelector<HTMLOutputElement>(
      "#approval-constraints",
    )!;
    output.value = `${field("screenshot_policy").value !== "manual_or_model" ? "현재 화면 캡처 설정은 모델의 화면 전송 요청을 차단합니다. " : ""}저장된 거부·회사 정책·제한 페이지·Chrome 자체 권한을 유지합니다.${current.approval_policy.tool_scope === "approved_plan" ? " 도구 자동 승인은 승인된 계획의 출처에 한정됩니다." : ""}`;
  };
  form.addEventListener("change", (event) => {
    const name = (event.target as HTMLInputElement).name;
    if (name?.startsWith("approval_") && name !== "approval_mode")
      mode.value = "custom";
    if (mode.value !== "custom") current.approval_policy.tool_scope = "request";
    render();
  });
  return {
    apply(value: AgentPreferences) {
      current = structuredClone(value);
      for (const [name, data] of Object.entries(value)) {
        if (name === "approval_policy") continue;
        const input = field(name);
        if (typeof data === "boolean" && input instanceof HTMLInputElement)
          input.checked = data;
        else if (typeof data === "string") input.value = data;
      }
      mode.value = value.approval_policy.mode;
      for (const category of preferenceCategories)
        field(`approval_${category}`).value =
          value.approval_policy.mode === "custom"
            ? value.approval_policy.categories[category]
            : value.approval_policy.mode === "full"
              ? "auto"
              : "ask";
      render();
    },
    read(): AgentPreferences {
      const value = structuredClone(current);
      for (const key of [
        "permission_mode",
        "default_read_scope",
        "screenshot_policy",
      ] as const)
        Object.assign(value, { [key]: field(key).value });
      for (const key of [
        "page_method_enabled",
        "group_tools_in_timeline",
        "show_tool_debug_details",
      ] as const)
        value[key] = (field(key) as HTMLInputElement).checked;
      Object.assign(value.approval_policy, { mode: mode.value });
      for (const category of preferenceCategories)
        Object.assign(value.approval_policy.categories, {
          [category]: field(`approval_${category}`).value,
        });
      return agentPreferencesSchema.parse(value);
    },
  };
}
