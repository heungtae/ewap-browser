import type { ActionIntent, Outcome } from "../contracts/types.js";
import { fail } from "../security/validation.js";
import { preflightTarget, type Target } from "./preflight.js";
export type MutableTarget = Target & {
  value?: string;
  options?: string[];
  selected?: string;
  focus?: boolean;
  clicked?: boolean;
  keys?: string[];
};
export type Execution = { outcome: Outcome; target: MutableTarget };
export const executePrimitive = (
  intent: ActionIntent,
  target: MutableTarget,
  value?: string,
): Execution => {
  preflightTarget(intent.tool, target);
  if (intent.tool === "set_text_by_ref") {
    if (value === undefined) return fail("VALUE_BINDING_INVALID");
    target.value = value;
  } else if (intent.tool === "select_option_by_ref") {
    if (value === undefined || !target.options?.includes(value))
      return fail("TARGET_NOT_ACTIONABLE");
    target.selected = value;
  } else if (intent.tool === "set_checked_by_ref") {
    const checked = intent.argument?.checked;
    if (typeof checked !== "boolean" || target.checked === checked)
      return fail("TARGET_NOT_ACTIONABLE");
    target.checked = checked;
  } else if (intent.tool === "click_by_ref") {
    if (target.trustedInputRequired) fail("TARGET_NOT_ACTIONABLE");
    target.clicked = true;
  } else {
    const key = intent.argument?.key;
    if (!target.focus || !key || target.trustedInputRequired)
      return fail("TARGET_NOT_ACTIONABLE");
    target.keys = [...(target.keys ?? []), key];
  }
  return { outcome: "VERIFIED", target };
};
