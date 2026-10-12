import {
  migrateApprovalPolicy,
  resolveApproval,
  validateApprovalPolicy,
  type ApprovalPolicy,
} from "./approval-policy.js";
import type { PageReadScope } from "../contracts/types.js";
import { fail, isPlainObject } from "../security/validation.js";
import {
  permissionHost,
  type Capability,
  type PermissionManager,
} from "./permission-manager.js";

export type PermissionMode =
  | "standard"
  | "follow_a_plan"
  | "skip_all_permission_checks";
export type AgentPreferences = {
  approval_policy?: ApprovalPolicy;
  page_method_enabled?: boolean;
  permission_mode: PermissionMode;
  default_read_scope: PageReadScope;
  screenshot_policy: "manual_or_model" | "manual_only" | "disabled";
  group_tools_in_timeline: boolean;
  show_tool_debug_details: boolean;
};
export type PermissionGateResult =
  | "ALLOW"
  | "DENY"
  | "REQUIRE_PERMISSION"
  | "PLAN_SCOPE_VIOLATION";

const modes = new Set<PermissionMode>([
  "standard",
  "follow_a_plan",
  "skip_all_permission_checks",
]);
const scopes = new Set<PageReadScope>([
  "all_dom",
  "visible_only",
  "interactive",
]);
const screenshotPolicies = new Set([
  "manual_or_model",
  "manual_only",
  "disabled",
]);

export const defaultAgentPreferences = (): AgentPreferences => ({
  permission_mode: "standard",
  default_read_scope: "all_dom",
  screenshot_policy: "manual_or_model",
  group_tools_in_timeline: true,
  show_tool_debug_details: false,
});

export const allowsModelScreenshot = (
  policy: AgentPreferences["screenshot_policy"],
): boolean => policy === "manual_or_model";

export const validateAgentPreferences = (value: unknown): AgentPreferences => {
  if (!isPlainObject(value)) return fail("INVALID_ARGUMENT");
  const keys = [
    "approval_policy",
    "page_method_enabled",
    "permission_mode",
    "default_read_scope",
    "screenshot_policy",
    "group_tools_in_timeline",
    "show_tool_debug_details",
  ];
  if (Object.keys(value).some((key) => !keys.includes(key)))
    return fail("INVALID_ARGUMENT");
  if (
    (value.page_method_enabled !== undefined &&
      typeof value.page_method_enabled !== "boolean") ||
    typeof value.permission_mode !== "string" ||
    !modes.has(value.permission_mode as PermissionMode) ||
    typeof value.default_read_scope !== "string" ||
    !scopes.has(value.default_read_scope as PageReadScope) ||
    typeof value.screenshot_policy !== "string" ||
    !screenshotPolicies.has(value.screenshot_policy) ||
    typeof value.group_tools_in_timeline !== "boolean" ||
    typeof value.show_tool_debug_details !== "boolean"
  )
    return fail("INVALID_ARGUMENT");
  return {
    page_method_enabled: value.page_method_enabled !== false,
    approval_policy:
      value.approval_policy === undefined
        ? migrateApprovalPolicy(value.permission_mode as string)
        : validateApprovalPolicy(value.approval_policy),
    permission_mode: value.permission_mode as PermissionMode,
    default_read_scope: value.default_read_scope as PageReadScope,
    screenshot_policy:
      value.screenshot_policy as AgentPreferences["screenshot_policy"],
    group_tools_in_timeline: value.group_tools_in_timeline,
    show_tool_debug_details: value.show_tool_debug_details,
  };
};

/**
 * Permission mode only changes the prompt stage. The caller must run category,
 * credential, R2/R3, ref/preflight and verifier hard policy before this gate.
 */
export const gatePermission = (
  manager: Pick<PermissionManager, "check">,
  preferences: AgentPreferences,
  capability: Capability,
  url: string,
  runId: string,
  approvedPlanOrigins: ReadonlySet<string> = new Set(),
): PermissionGateResult => {
  if (capability === "page_method" && preferences.page_method_enabled === false)
    return "DENY";
  permissionHost(url);
  const origin = new URL(url).origin;
  const stored = manager.check(capability, url, runId);
  if (stored === "DENY") return "DENY";
  const policy =
    preferences.approval_policy ??
    migrateApprovalPolicy(preferences.permission_mode);
  const decision = resolveApproval(policy, "tool_permission");
  if (decision === "deny") return "DENY";
  if (decision === "auto")
    return policy.tool_scope === "approved_plan" &&
      !approvedPlanOrigins.has(origin)
      ? "PLAN_SCOPE_VIOLATION"
      : "ALLOW";
  return stored;
};
