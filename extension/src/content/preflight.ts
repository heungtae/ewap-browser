import type { MutationTool, Role, SemanticNode } from "../contracts/types.js";
import { isSensitive } from "../security/redaction.js";
import { fail } from "../security/validation.js";
export type Target = {
  role: Role;
  name: string;
  visible: boolean;
  enabled: boolean;
  sensitive?: boolean;
  occluded?: boolean;
  trustedInputRequired?: boolean;
  tag: "input" | "textarea" | "select" | "button" | "other";
  checked?: boolean;
};
export const preflightTarget = (tool: MutationTool, target: Target): Target => {
  if (
    !target.visible ||
    !target.enabled ||
    target.occluded ||
    target.sensitive ||
    isSensitive(target.role, target.name)
  )
    fail("TARGET_NOT_ACTIONABLE");
  if (
    (tool === "set_text_by_ref" &&
      !(target.tag === "input" || target.tag === "textarea")) ||
    (tool === "select_option_by_ref" && target.tag !== "select") ||
    (tool === "set_checked_by_ref" &&
      !(target.role === "checkbox" || target.role === "radio"))
  )
    fail("TARGET_NOT_ACTIONABLE");
  return target;
};
export const targetFromNode = (node: SemanticNode): Target => ({
  role: node.role,
  name: node.name,
  visible: node.visible,
  enabled: node.enabled,
  tag:
    node.role === "textbox"
      ? "input"
      : node.role === "combobox"
        ? "select"
        : node.role === "button"
          ? "button"
          : "other",
  ...(typeof node.state.checked === "boolean"
    ? { checked: node.state.checked }
    : {}),
});
