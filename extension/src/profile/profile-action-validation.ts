import type {
  CompletionContract,
  MutationTool,
  Role,
  VerifierPredicate,
} from "../contracts/types.js";
import { isPlainObject } from "../security/validation.js";

export const mutationTools = new Set<MutationTool>([
  "set_text_by_ref",
  "select_option_by_ref",
  "set_checked_by_ref",
  "click_by_ref",
  "press_key_by_ref",
  "navigate",
]);
export const roles = new Set<Role>([
  "button",
  "checkbox",
  "combobox",
  "heading",
  "link",
  "option",
  "radio",
  "textbox",
  "listbox",
  "tab",
  "menuitem",
  "dialog",
  "alert",
  "status",
  "navigation",
  "main",
  "form",
]);
const isStatePredicate = (value: unknown): boolean =>
  isPlainObject(value) &&
  Object.keys(value).every((key) =>
    ["ref_id", "field", "expected"].includes(key),
  ) &&
  typeof value.ref_id === "string" &&
  ["checked", "selected", "disabled", "expanded"].includes(
    value.field as string,
  ) &&
  typeof value.expected === "boolean";
export const isSemanticVerifier = (
  value: unknown,
): value is Extract<VerifierPredicate, { kind: "semantic-state-transition" }> =>
  isPlainObject(value) &&
  Object.keys(value).every((key) =>
    ["kind", "declaration_id", "pre_state_digest", "required_changes"].includes(
      key,
    ),
  ) &&
  value.kind === "semantic-state-transition" &&
  typeof value.declaration_id === "string" &&
  value.declaration_id.length > 0 &&
  typeof value.pre_state_digest === "string" &&
  Array.isArray(value.required_changes) &&
  value.required_changes.every(isStatePredicate);
const isMarker = (value: unknown): boolean =>
  isPlainObject(value) &&
  Object.keys(value).every((key) => ["role", "name", "state"].includes(key)) &&
  typeof value.role === "string" &&
  roles.has(value.role as Role) &&
  typeof value.name === "string" &&
  value.name.length > 0 &&
  value.name.length <= 160 &&
  (value.state === undefined ||
    (isPlainObject(value.state) &&
      Object.keys(value.state).every((key) =>
        ["field", "expected"].includes(key),
      ) &&
      ["checked", "selected", "disabled", "expanded"].includes(
        value.state.field as string,
      ) &&
      typeof value.state.expected === "boolean"));
export const isCompletionContract = (
  value: unknown,
): value is CompletionContract => {
  if (!isPlainObject(value) || value.version !== 2) return false;
  const base =
    typeof value.source === "string" &&
    typeof value.scope_policy === "string" &&
    typeof value.report_scope === "string";
  if (!base) return false;
  if (value.kind === "control_state")
    return (
      Object.keys(value).every((key) =>
        [
          "version",
          "kind",
          "source",
          "scope_policy",
          "report_scope",
          "expected_changes",
        ].includes(key),
      ) &&
      ["browser_derived", "trusted_profile"].includes(value.source as string) &&
      value.scope_policy === "same_scope" &&
      ["control", "ui"].includes(value.report_scope as string) &&
      Array.isArray(value.expected_changes) &&
      value.expected_changes.length > 0 &&
      value.expected_changes.every(isStatePredicate)
    );
  if (value.kind === "ui_relation")
    return (
      Object.keys(value).every((key) =>
        [
          "version",
          "kind",
          "source",
          "scope_policy",
          "report_scope",
          "marker",
        ].includes(key),
      ) &&
      value.source === "trusted_profile" &&
      value.scope_policy === "same_scope" &&
      value.report_scope === "ui" &&
      isMarker(value.marker)
    );
  if (value.kind === "navigation")
    return (
      Object.keys(value).every((key) =>
        [
          "version",
          "kind",
          "source",
          "scope_policy",
          "report_scope",
          "destination_marker",
        ].includes(key),
      ) &&
      ["browser_derived", "trusted_profile"].includes(value.source as string) &&
      ["navigation", "declared_alternatives"].includes(
        value.scope_policy as string,
      ) &&
      value.report_scope === "navigation" &&
      (value.destination_marker === undefined ||
        isMarker(value.destination_marker))
    );
  return (
    value.kind === "render_result" &&
    Object.keys(value).every((key) =>
      [
        "version",
        "kind",
        "source",
        "scope_policy",
        "report_scope",
        "marker",
        "requires_result_generation",
      ].includes(key),
    ) &&
    value.source === "trusted_profile" &&
    ["same_scope", "declared_alternatives"].includes(
      value.scope_policy as string,
    ) &&
    value.report_scope === "result" &&
    value.requires_result_generation === true &&
    isMarker(value.marker)
  );
};
