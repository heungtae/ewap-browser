import { denied, scrub } from "./privacy.js";
import { enter, text, type WalkBudget } from "./walk.js";
export function options(element: Element, budget: WalkBudget): string[] {
  if (element.tagName !== "SELECT") return [];
  const result: string[] = [];
  let node: Element | null = element.firstElementChild;
  while (node) {
    if (!enter(budget)) break;
    if (node.tagName === "OPTION" && !denied(node)) {
      if (result.length >= 20) {
        budget.reasons.add("SAMPLE_ONLY");
        budget.omitted++;
        break;
      }
      result.push(scrub(text(node, budget)));
    }
    let next: Element | null = node.firstElementChild;
    while (!next && node && node !== element) {
      next = node.nextElementSibling;
      if (!next) node = node.parentElement;
    }
    node = next;
  }
  return result;
}
export function checked(element: Element): boolean {
  return element.tagName === "INPUT"
    ? (element as HTMLInputElement).checked
    : element.getAttribute("aria-checked") === "true";
}
