import { digestCanonical } from "../security/canonical.js";

/** Bounded, local-only comparison of result regions, including input state. */
export const completionRegionDigest = (
  element: HTMLElement,
  readText: (element: HTMLElement) => string,
  sensitive: (element: Element) => boolean,
): string | undefined => {
  const text = readText(element);
  const controls = element.querySelectorAll("input,textarea,select");
  const states = element.querySelectorAll(
    "button,[role],[aria-disabled],[aria-expanded],[aria-selected],[aria-checked]",
  );
  if (text.length > 12_000 || controls.length > 128 || states.length > 128)
    return undefined;
  const values = [];
  for (const control of controls) {
    if (sensitive(control)) return undefined;
    if (control.closest('[hidden],[aria-hidden="true"]')) continue;
    if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement
    ) {
      if (control.value.length > 12_000) return undefined;
      values.push({
        value_digest: digestCanonical(control.value),
        disabled: control.disabled,
        ...(control instanceof HTMLInputElement
          ? { checked: control.checked }
          : {}),
        ...(control instanceof HTMLSelectElement
          ? { selected: control.selectedIndex }
          : {}),
      });
    }
  }
  const ui = [...states].map((node) => ({
    role: node.getAttribute("role"),
    name: node.getAttribute("aria-label"),
    visible: node.getClientRects().length > 0,
    disabled:
      node.hasAttribute("disabled") ||
      node.getAttribute("aria-disabled") === "true",
    expanded: node.getAttribute("aria-expanded"),
    selected: node.getAttribute("aria-selected"),
    checked: node.getAttribute("aria-checked"),
  }));
  if (ui.some((state) => (state.name?.length ?? 0) > 1024)) return undefined;
  return digestCanonical({ text, values, ui });
};
