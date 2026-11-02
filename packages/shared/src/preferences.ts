import { z } from "zod";
export const preferenceCategories = [
  "action_execution",
  "plan_approval",
  "tool_permission",
  "risk_confirmation",
  "source_disclosure",
  "runtime_data_disclosure",
  "vision_disclosure",
  "scroll_read",
] as const;
export const approvalPreferenceSchema = z.strictObject({
  version: z.literal(2),
  revision: z.number().int().nonnegative().safe(),
  mode: z.enum(["ask", "full", "custom"]),
  tool_scope: z.enum(["request", "approved_plan"]),
  categories: z.record(
    z.enum(preferenceCategories),
    z.enum(["ask", "auto", "deny"]),
  ),
});
// Configuration intent only: these values are never execution or disclosure grants.
export const agentPreferencesSchema = z.strictObject({
  permission_mode: z.enum([
    "standard",
    "follow_a_plan",
    "skip_all_permission_checks",
  ]),
  approval_policy: approvalPreferenceSchema,
  default_read_scope: z.enum(["all_dom", "visible_only", "interactive"]),
  screenshot_policy: z.enum(["manual_or_model", "manual_only", "disabled"]),
  page_method_enabled: z.boolean(),
  group_tools_in_timeline: z.boolean(),
  show_tool_debug_details: z.boolean(),
});
export type AgentPreferences = z.infer<typeof agentPreferencesSchema>;
export const defaultAgentPreferences = (): AgentPreferences =>
  agentPreferencesSchema.parse({
    permission_mode: "standard",
    approval_policy: {
      version: 2,
      revision: 0,
      mode: "ask",
      tool_scope: "request",
      categories: Object.fromEntries(
        preferenceCategories.map((c) => [c, "ask"]),
      ),
    },
    default_read_scope: "all_dom",
    screenshot_policy: "manual_or_model",
    page_method_enabled: true,
    group_tools_in_timeline: true,
    show_tool_debug_details: false,
  });
export function normalizePreferences(
  input: AgentPreferences,
  revision: number,
): AgentPreferences {
  const value = agentPreferencesSchema.parse(input);
  value.approval_policy.revision = revision;
  if (value.approval_policy.mode !== "custom") {
    value.approval_policy.tool_scope = "request";
    for (const category of preferenceCategories)
      value.approval_policy.categories[category] =
        value.approval_policy.mode === "ask" ? "ask" : "auto";
  }
  value.permission_mode =
    value.approval_policy.tool_scope === "approved_plan"
      ? "follow_a_plan"
      : "standard";
  return value;
}
