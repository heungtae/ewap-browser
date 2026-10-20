import { denied, scrub } from "./privacy.js";
import { enter, text, type WalkBudget } from "./walk.js";
export function sampleCollection(
  root: Element,
  budget: WalkBudget,
): { headers: string[]; sample: string[][] } {
  const headers: string[] = [];
  const sample: string[][] = [];
  let row: string[] | null = null;
  let node: Element | null = root.firstElementChild;
  while (node) {
    if (!enter(budget)) break;
    const excluded = denied(node);
    if (excluded) {
      budget.redactions++;
      budget.omitted++;
      budget.reasons.add("DENIED_REGION");
    }
    const role = node.getAttribute("role");
    const nested =
      node.tagName === "TABLE" ||
      ["grid", "table", "tree", "list", "listbox"].includes(role ?? "");
    if (!excluded && (node.tagName === "TR" || role === "row")) {
      if (row?.length) sample.push(row);
      row = [];
      if (sample.length >= 5) {
        budget.reasons.add("SAMPLE_ONLY");
        budget.omitted++;
        break;
      }
    }
    if (!excluded && (node.tagName === "TH" || role === "columnheader")) {
      if (headers.length < 20)
        headers.push(scrub(text(node, budget, 201, true)));
      else {
        budget.reasons.add("SAMPLE_ONLY");
        budget.omitted++;
      }
    } else if (
      !excluded &&
      (node.tagName === "TD" || role === "cell" || role === "gridcell")
    ) {
      row ??= [];
      if (row.length < 20) {
        const value = text(node, budget, 201, true);
        if (value.length > 200) {
          budget.reasons.add("CELL_TRUNCATED");
          budget.omitted++;
        }
        row.push(scrub(value));
      } else {
        budget.reasons.add("SAMPLE_ONLY");
        budget.omitted++;
      }
    }
    let next: Element | null =
      nested || excluded ? null : node.firstElementChild;
    while (!next && node && node !== root) {
      next = node.nextElementSibling;
      if (!next) node = node.parentElement;
    }
    node = next;
  }
  if (row?.length && sample.length < 5) sample.push(row);
  if (sample.length) budget.reasons.add("SAMPLE_ONLY");
  return { headers, sample };
}
