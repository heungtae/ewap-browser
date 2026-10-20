import { denied } from "./privacy.js";
export interface WalkBudget {
  examined: number;
  redactions: number;
  omitted: number;
  reasons: Set<string>;
  deadline: number;
  now(): number;
  signal?: AbortSignal;
  current(): boolean;
}
export function enter(budget: WalkBudget): boolean {
  if (budget.signal?.aborted) budget.reasons.add("CANCELLED");
  if (!budget.current()) budget.reasons.add("DOCUMENT_CHANGED");
  if (budget.now() >= budget.deadline) budget.reasons.add("UNIT_TIMEOUT");
  if (budget.examined >= 5000) budget.reasons.add("NODE_LIMIT");
  if (
    budget.reasons.has("CANCELLED") ||
    budget.reasons.has("DOCUMENT_CHANGED") ||
    budget.reasons.has("UNIT_TIMEOUT") ||
    budget.reasons.has("NODE_LIMIT")
  )
    return false;
  budget.examined++;
  return true;
}
export async function* walk(
  root: Element | ShadowRoot,
  budget: WalkBudget,
  depth = 0,
): AsyncGenerator<Element> {
  let node: Element | null =
    root.nodeType === 1 ? (root as Element) : root.firstElementChild;
  while (node) {
    if (!enter(budget)) {
      budget.omitted++;
      return;
    }
    const excluded = denied(node);
    if (excluded) {
      budget.redactions++;
      budget.omitted++;
      budget.reasons.add("DENIED_REGION");
    } else {
      yield node;
      if (node.shadowRoot) {
        if (depth < 4) yield* walk(node.shadowRoot, budget, depth + 1);
        else {
          budget.reasons.add("SHADOW_UNAVAILABLE");
          budget.omitted++;
        }
      }
    }
    let next: Element | null = excluded ? null : node.firstElementChild;
    while (!next && node && node !== root) {
      next = node.nextElementSibling;
      if (!next) node = node.parentElement;
    }
    if (!next) return;
    node = next;
    if (budget.examined % 64 === 0)
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}
// Bound text separately; textContent/innerText can enumerate an entire subtree.
export function text(
  root: Element,
  budget: WalkBudget,
  limit = 200,
  excludeComponents = false,
): string {
  let result = "";
  let node: Node | null = root.firstChild;
  let count = 0;
  while (node && count++ < 32 && result.length < limit) {
    if (!enter(budget)) break;
    if (node.nodeType === 3)
      result += node.nodeValue?.slice(0, limit - result.length) ?? "";
    if (node.nodeType === 1 && denied(node as Element)) {
      budget.redactions++;
      break;
    }
    const nested =
      excludeComponents &&
      node.nodeType === 1 &&
      ["TABLE", "UL", "OL"].includes((node as Element).tagName);
    let next: Node | null = nested ? null : node.firstChild;
    while (!next && node && node !== root) {
      next = node.nextSibling;
      if (!next) node = node.parentNode;
    }
    node = next;
  }
  return result;
}
