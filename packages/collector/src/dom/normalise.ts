import { digest, type Observation } from "@contextpilot/codebase-schema";
import { name } from "./classify.js";
import { safeUrl } from "./privacy.js";
import { sampleCollection } from "./collections.js";
import { options as controlOptions, checked } from "./control-metadata.js";
import type { WalkBudget } from "./walk.js";
export async function normaliseRecord(
  element: Element,
  budget: WalkBudget,
  initial: Pick<
    Observation,
    | "evidenceId"
    | "parentEvidenceId"
    | "sourceLocation"
    | "visible"
    | "role"
    | "kind"
    | "control"
  >,
): Promise<Observation> {
  const {
    evidenceId,
    parentEvidenceId,
    sourceLocation,
    visible,
    role: r,
    kind: k,
    control: c,
  } = initial;
  let rawKey =
    element.getAttribute("data-testid") ?? element.getAttribute("id");
  if (rawKey && rawKey.length > 200) {
    rawKey = null;
    budget.omitted++;
    budget.reasons.add("CELL_TRUNCATED");
  }
  const rawHref = element.getAttribute("href");
  if (rawHref && rawHref.length > 2048) {
    budget.omitted++;
    budget.reasons.add("ROUTE_LIMIT");
  }
  const route =
    c === "link" && rawHref && rawHref.length <= 2048
      ? safeUrl(rawHref, element.ownerDocument.baseURI)
      : null;
  const data = ["table", "grid"].includes(k ?? "")
    ? sampleCollection(element, budget)
    : { headers: [], sample: [] };
  return {
    evidenceId,
    parentEvidenceId,
    sourceLocation,
    role: r,
    kind: k,
    name: name(element, budget) || k || c || "unknown",
    stableKey: rawKey ? await digest(rawKey) : null,
    visible,
    enabled:
      !element.matches(":disabled") &&
      element.getAttribute("aria-disabled") !== "true",
    editable: c === "text" && !element.hasAttribute("readonly"),
    checked: ["checkbox", "radio"].includes(c ?? "") ? checked(element) : null,
    selected: element.hasAttribute("aria-selected")
      ? element.getAttribute("aria-selected") === "true"
      : null,
    control: c,
    inputType: element.getAttribute("type")?.slice(0, 32) ?? null,
    required: element.hasAttribute("required"),
    min: element.getAttribute("min")?.slice(0, 64) ?? null,
    max: element.getAttribute("max")?.slice(0, 64) ?? null,
    step: element.getAttribute("step")?.slice(0, 64) ?? null,
    pattern: element.getAttribute("pattern")?.slice(0, 200) ?? null,
    options: controlOptions(element, budget),
    routeKey: route ? await digest(route.href) : null,
    ...data,
  };
}
