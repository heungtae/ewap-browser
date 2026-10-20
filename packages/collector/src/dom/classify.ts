import type { Observation } from "@contextpilot/codebase-schema";
import { privateAncestor, scrub } from "./privacy.js";
import { text, type WalkBudget } from "./walk.js";
const data = new Set(["table", "grid", "tree", "list", "listbox"]);
export function role(element: Element): string {
  const explicit = element.getAttribute("role");
  if (explicit) return explicit.slice(0, 32);
  return (
    (
      {
        TABLE: "table",
        UL: "list",
        OL: "list",
        FORM: "form",
        DIALOG: "dialog",
        FIELDSET: "group",
        FIGURE: "visual",
        IMG: "visual",
        SVG: "visual",
        CANVAS: "visual",
        BUTTON: "button",
        A: "link",
        SELECT: "select",
        TEXTAREA: "textbox",
        INPUT: "input",
        TH: "columnheader",
        TR: "row",
      } as Record<string, string>
    )[element.tagName] ?? ""
  );
}
export function kind(element: Element, r: string): Observation["kind"] {
  if (element.tagName === "TABLE") return "table";
  if (element.tagName === "FORM") return "form";
  if (
    ["IMG", "SVG", "CANVAS", "FIGURE"].includes(element.tagName) ||
    r === "img"
  )
    return "visual";
  if (data.has(r)) return r as Observation["kind"];
  if (["form", "dialog", "tabpanel"].includes(r))
    return r as Observation["kind"];
  if (
    r === "group" &&
    (element.hasAttribute("aria-label") ||
      element.firstElementChild?.tagName === "LEGEND")
  )
    return "group";
  if (r === "visual") return "visual";
  if (
    ["region", "main", "navigation", "complementary"].includes(r) &&
    element.hasAttribute("aria-label")
  )
    return "region";
  return null;
}
export function control(element: Element, r: string): Observation["control"] {
  if (r === "button") return "button";
  if (r === "link" && element.hasAttribute("href")) return "link";
  const type = element.getAttribute("type")?.toLowerCase() ?? "text";
  if (
    r === "checkbox" ||
    r === "radio" ||
    (element.tagName === "INPUT" && ["checkbox", "radio"].includes(type))
  )
    return type === "radio" || r === "radio" ? "radio" : "checkbox";
  if (element.tagName === "SELECT") return "select";
  if (
    element.tagName === "TEXTAREA" ||
    (element.tagName === "INPUT" &&
      ["text", "search", "number", "date", "email", "tel", "url"].includes(
        type,
      ))
  )
    return "text";
  return null;
}
export function name(element: Element, budget: WalkBudget): string {
  let value =
    element.getAttribute("aria-label") ?? element.getAttribute("alt") ?? "";
  if (!value) {
    const labelId =
      element
        .getAttribute("aria-labelledby")
        ?.slice(0, 1024)
        .split(/\s+/)
        .slice(0, 4) ?? [];
    value = labelId
      .map((id) => {
        const label = element.ownerDocument.getElementById(id);
        return label && !privateAncestor(label) ? text(label, budget) : "";
      })
      .join(" ");
  }
  if (!value && element.parentElement?.tagName === "LABEL")
    value = text(element.parentElement, budget);
  if (
    !value &&
    ["CAPTION", "LEGEND", "FIGCAPTION", "H1", "H2", "H3"].includes(
      element.firstElementChild?.tagName ?? "",
    )
  )
    value = text(element.firstElementChild!, budget);
  if (
    !value &&
    ["BUTTON", "A", "TH", "LEGEND", "CAPTION", "H1", "H2", "H3"].includes(
      element.tagName,
    )
  )
    value = text(element, budget);
  return scrub(value || element.getAttribute("title") || "");
}
