import {
  approvalCategories,
  approvalLabels,
  migrateApprovalPolicy,
  resolveApproval,
  validateApprovalPolicy,
  type ApprovalPolicy,
} from "../policy/approval-policy.js";
let policy = migrateApprovalPolicy("standard");
const form = document.querySelector<HTMLFormElement>("#agent-preferences-form");
const mode = form?.elements.namedItem(
  "approval_mode",
) as HTMLSelectElement | null;
const container = document.querySelector("#approval-categories");
for (const category of approvalCategories) {
  const label = document.createElement("label");
  label.textContent = approvalLabels[category];
  const select = document.createElement("select");
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
  select.addEventListener("change", () => {
    if (mode) mode.value = "custom";
    policy.mode = "custom";
    policy.categories[category] =
      select.value as ApprovalPolicy["categories"][typeof category];
  });
  label.append(select);
  container?.append(label);
}
const render = () => {
  if (mode) mode.value = policy.mode;
  if (container instanceof HTMLElement)
    container.hidden = policy.mode !== "custom";
  for (const category of approvalCategories) {
    const select = form?.elements.namedItem(
      `approval_${category}`,
    ) as HTMLSelectElement | null;
    if (select) select.value = resolveApproval(policy, category);
  }
};
mode?.addEventListener("change", () => {
  policy.mode = mode.value as ApprovalPolicy["mode"];
  if (policy.mode !== "custom") policy.tool_scope = "request";
  render();
});
const constraints = () => {
  const screenshot = form?.elements.namedItem(
    "screenshot_policy",
  ) as HTMLSelectElement | null;
  const output = document.querySelector<HTMLOutputElement>(
    "#approval-constraints",
  );
  if (output)
    output.value = `${screenshot?.value !== "manual_or_model" ? "현재 화면 캡처 설정은 모델의 화면 전송 요청을 차단합니다. " : ""}저장된 거부·회사 정책·제한 페이지·Chrome 자체 권한을 유지합니다.${policy.tool_scope === "approved_plan" ? " 도구 자동 승인은 승인된 계획의 출처에 한정됩니다." : ""}`;
};
form?.addEventListener("change", constraints);
export const applyApprovalSettings = (
  preferences: Record<string, unknown>,
): void => {
  policy =
    preferences.approval_policy === undefined
      ? migrateApprovalPolicy(String(preferences.permission_mode))
      : validateApprovalPolicy(preferences.approval_policy);
  render();
  constraints();
};
export const readApprovalSettings = (): ApprovalPolicy => {
  if (mode) policy.mode = mode.value as ApprovalPolicy["mode"];
  for (const category of approvalCategories) {
    const select = form?.elements.namedItem(
      `approval_${category}`,
    ) as HTMLSelectElement | null;
    if (select)
      policy.categories[category] =
        select.value as ApprovalPolicy["categories"][typeof category];
  }
  return validateApprovalPolicy(policy);
};
