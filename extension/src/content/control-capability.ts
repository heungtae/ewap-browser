import { controlDisabled, readChecked } from "./checked-control.js";
import type { ControlAction } from "../contracts/semantic-types.js";

/** Shared public facts: declaration and fresh dispatch use these predicates. */
export const controlActions = (
  element: Element,
  role: string,
): ControlAction[] => {
  if (controlDisabled(element)) return [];
  if (readChecked(element) !== undefined) return ["set_checked_by_ref"];
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    if (
      element instanceof HTMLInputElement &&
      ["button", "submit", "reset"].includes(element.type)
    )
      return role === "button" ? ["click_by_ref", "press_key_by_ref"] : [];
    const text =
      element instanceof HTMLTextAreaElement ||
      ["text", "search", "email", "url", "tel"].includes(element.type);
    return role === "textbox" && text && !element.readOnly
      ? ["set_text_by_ref", "press_key_by_ref"]
      : [];
  }
  if (element instanceof HTMLSelectElement)
    return !element.multiple && role === "combobox"
      ? ["select_option_by_ref"]
      : [];
  if (element instanceof HTMLAnchorElement)
    return ["link", "menuitem"].includes(role)
      ? ["navigate"]
      : role === "button"
        ? ["click_by_ref"]
        : [];
  if (
    element.tagName === "SUMMARY" ||
    element instanceof HTMLButtonElement ||
    ["button", "tab", "menuitem", "option"].includes(role)
  )
    return ["click_by_ref", "press_key_by_ref"];
  return [];
};

export const controlSupportReason = (element: Element, role: string) => {
  if (
    controlDisabled(element) ||
    ((element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement) &&
      element.readOnly)
  )
    return "BLOCKED" as const;
  return controlActions(element, role).length
    ? ("SUPPORTED" as const)
    : ("UNSUPPORTED_CONTROL" as const);
};
