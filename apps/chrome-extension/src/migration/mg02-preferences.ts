import { validateAgentPreferences } from "../../../../extension/src/policy/permission-mode.js";
import { isPlainObject } from "../../../../extension/src/security/validation.js";
import {
  migratedCategories,
  type MigratedPolicy,
} from "../../../../packages/policy-engine/src/migration-contract.js";
export function safeMigrationPreferences(): MigratedPolicy["preferences"] {
  return {
    policyRevision: 1,
    mode: "custom",
    categories: Object.fromEntries(
      migratedCategories.map((key) => [key, "ask"]),
    ) as MigratedPolicy["preferences"]["categories"],
    toolScope: "request",
    defaultReadScope: "visible_only",
    screenshotPolicy: "manual_only",
    pageMethodEnabled: false,
    groupToolsInTimeline: true,
    showToolDebugDetails: false,
  };
}
export function convertPreferences(raw: unknown) {
  const source = validateAgentPreferences(raw);
  const policy = source.approval_policy!;
  if (policy.revision === Number.MAX_SAFE_INTEGER)
    throw new Error("MG02_REVISION_EXHAUSTED");
  const declared =
    isPlainObject(raw) &&
    isPlainObject(raw.approval_policy) &&
    isPlainObject(raw.approval_policy.categories)
      ? raw.approval_policy.categories
      : {};
  const preferences = safeMigrationPreferences();
  preferences.policyRevision = policy.revision + 1;
  for (const key of migratedCategories)
    preferences.categories[key] =
      declared[key] === "deny" || policy.categories[key] === "deny"
        ? "deny"
        : "ask";
  preferences.toolScope = policy.tool_scope;
  preferences.defaultReadScope = source.default_read_scope;
  preferences.screenshotPolicy =
    source.screenshot_policy === "disabled" ? "disabled" : "manual_only";
  preferences.pageMethodEnabled =
    isPlainObject(raw) && raw.page_method_enabled === true;
  preferences.groupToolsInTimeline = source.group_tools_in_timeline;
  preferences.showToolDebugDetails = source.show_tool_debug_details;
  return { preferences, sourceRevision: policy.revision };
}
