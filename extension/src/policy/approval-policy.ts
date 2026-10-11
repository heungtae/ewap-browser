import { fail, isPlainObject } from "../security/validation.js";

export const approvalCategories = [
  "action_execution",
  "plan_approval",
  "tool_permission",
  "risk_confirmation",
  "source_disclosure",
  "runtime_data_disclosure",
  "vision_disclosure",
  "scroll_read",
] as const;
export type ApprovalCategory = (typeof approvalCategories)[number];
export type ApprovalDecision = "ask" | "auto" | "deny";
export type ApprovalPolicy = {
  version: 2;
  revision: number;
  mode: "ask" | "full" | "custom";
  tool_scope: "request" | "approved_plan";
  categories: Record<ApprovalCategory, ApprovalDecision>;
};
export const approvalLabels: Record<ApprovalCategory, string> = {
  action_execution: "작업 제안 실행",
  plan_approval: "계획 승인",
  tool_permission: "사이트·도구 사용 권한",
  risk_confirmation: "중요 작업 추가 확인",
  source_disclosure: "페이지 코드 전송·분석",
  runtime_data_disclosure: "페이지 메서드 반환 자료 전송",
  vision_disclosure: "화면 전송·분석",
  scroll_read: "스크롤 자료 읽기",
};
export const defaultApprovalPolicy = (): ApprovalPolicy => ({
  version: 2,
  revision: 0,
  mode: "ask",
  tool_scope: "request",
  categories: Object.fromEntries(
    approvalCategories.map((c) => [c, "ask"]),
  ) as ApprovalPolicy["categories"],
});
export const migrateApprovalPolicy = (mode: string): ApprovalPolicy => {
  const policy = defaultApprovalPolicy();
  if (mode === "skip_all_permission_checks" || mode === "follow_a_plan") {
    policy.mode = "custom";
    policy.categories.tool_permission = "auto";
    if (mode === "follow_a_plan") policy.tool_scope = "approved_plan";
  }
  return policy;
};
export const validateApprovalPolicy = (value: unknown): ApprovalPolicy => {
  if (
    !isPlainObject(value) ||
    ![1, 2].includes(value.version as 1 | 2) ||
    Object.keys(value).length !== 5 ||
    Object.keys(value).some(
      (k) =>
        !["version", "revision", "mode", "tool_scope", "categories"].includes(
          k,
        ),
    )
  )
    return fail("INVALID_ARGUMENT");
  if (
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !["ask", "full", "custom"].includes(value.mode as string) ||
    !["request", "approved_plan"].includes(value.tool_scope as string) ||
    !isPlainObject(value.categories) ||
    Object.keys(value.categories).length !==
      approvalCategories.length - (value.version === 1 ? 1 : 0) ||
    Object.keys(value.categories).some(
      (k) =>
        !approvalCategories.includes(k as ApprovalCategory) ||
        (value.version === 1 && k === "runtime_data_disclosure"),
    ) ||
    approvalCategories.some(
      (c) =>
        !(value.version === 1 && c === "runtime_data_disclosure") &&
        !["ask", "auto", "deny"].includes(
          (value.categories as Record<string, unknown>)[c] as string,
        ),
    )
  )
    return fail("INVALID_ARGUMENT");
  const result = structuredClone({
    version: 2 as const,
    revision: value.revision as number,
    mode: value.mode as ApprovalPolicy["mode"],
    tool_scope: value.tool_scope as ApprovalPolicy["tool_scope"],
    categories: {
      ...(value.categories as Record<ApprovalCategory, ApprovalDecision>),
      ...(value.version === 1 ? { runtime_data_disclosure: "ask" } : {}),
    } as Record<ApprovalCategory, ApprovalDecision>,
  });
  if (result.mode !== "custom") {
    result.tool_scope = "request";
    for (const c of approvalCategories)
      result.categories[c] = result.mode === "full" ? "auto" : "ask";
  }
  return result;
};
export const resolveApproval = (
  policy: ApprovalPolicy,
  category: ApprovalCategory,
): ApprovalDecision => {
  if (!approvalCategories.includes(category)) return fail("INVALID_ARGUMENT");
  return policy.mode === "full"
    ? "auto"
    : policy.mode === "ask"
      ? "ask"
      : policy.categories[category];
};

export const approvalModeLabel = (policy: ApprovalPolicy): string =>
  policy.mode === "full"
    ? "full"
    : policy.mode === "ask"
      ? "standard"
      : policy.tool_scope === "approved_plan"
        ? "follow_a_plan"
        : "custom";
