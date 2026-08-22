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

export const validateAgentPreferences = (value: unknown): AgentPreferences => {
  if (!isPlainObject(value)) return fail("INVALID_ARGUMENT");
  const keys = [
    "permission_mode",
    "default_read_scope",
    "screenshot_policy",
    "group_tools_in_timeline",
    "show_tool_debug_details",
  ];
  if (Object.keys(value).some((key) => !keys.includes(key)))
    return fail("INVALID_ARGUMENT");
  if (
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
  manager: PermissionManager,
  preferences: AgentPreferences,
  capability: Capability,
  url: string,
  runId: string,
  approvedPlanOrigins: ReadonlySet<string> = new Set(),
): PermissionGateResult => {
  permissionHost(url);
  const origin = new URL(url).origin;
  const stored = manager.check(capability, url, runId);
  if (stored === "DENY") return "DENY";
  if (preferences.permission_mode === "skip_all_permission_checks")
    return "ALLOW";
  if (preferences.permission_mode === "follow_a_plan")
    return approvedPlanOrigins.has(origin) ? "ALLOW" : "PLAN_SCOPE_VIOLATION";
  return stored;
};
