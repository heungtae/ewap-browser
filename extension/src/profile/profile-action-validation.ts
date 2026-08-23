import type {
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
