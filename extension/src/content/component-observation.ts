import { sensitiveComponentElement } from "./component-sensitive-element.js";
import type { ObservedKind } from "../page-act-harness/component-descriptor.js";
import { maskComponentRows } from "../page-act-harness/component-facade.js";

export const componentSelector =
  'table,ul,ol,[role="table"],[role="grid"],[role="list"],[role="listbox"],[role="tree"],[role="img"],svg,canvas,img,figure,[role="region"]';
const sensitive =
  /password|passwd|secret|token|otp|mfa|credential|api.?key|비밀번호|인증/i;
export const visibleComponent = (element: Element): boolean => {
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  return (
    !element.closest('[hidden],[aria-hidden="true"],script,style') &&
    style?.display !== "none" &&
    style?.visibility !== "hidden" &&
    element.getBoundingClientRect().width > 0 &&
    element.getBoundingClientRect().height > 0
  );
};
export const safeComponentText = (element: Element): string => {
  if (sensitiveComponentElement(element)) return "[REDACTED]";
  const texts: string[] = [
    element.getAttribute("aria-label"),
    element.getAttribute("alt"),
    element.getAttribute("title"),
  ]
    .filter((value): value is string => !!value)
    .map((value) => value.slice(0, 500));
  let length = 0;
  const visit = (node: Node) => {
    if (length >= 4000) return;
    if (node.nodeType === 3) {
      const text = (node.textContent ?? "").slice(0, 4000 - length);
      texts.push(text);
      length += text.length;
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (
      !visibleComponent(el) ||
      el.matches("input,textarea,select,script,style")
    )
      return;
    if (sensitiveComponentElement(el)) {
      texts.push("[REDACTED]");
      return;
    }
    for (const child of el.childNodes) visit(child);
  };
  visit(element);
  return String(
    maskComponentRows([texts.join(" ").trim().slice(0, 4000)]).rows[0] ?? "",
  );
};
export const observeComponent = (element: Element) => {
  const tag = element.tagName.toLowerCase(),
    role = element.getAttribute("role");
  const kind: ObservedKind =
    role === "grid"
      ? "grid"
      : role === "tree"
        ? "tree"
        : tag === "table" || role === "table"
          ? "table"
          : ["ul", "ol"].includes(tag) || role === "list" || role === "listbox"
            ? "list"
            : tag === "svg"
              ? "svg"
              : tag === "canvas"
                ? "canvas"
                : tag === "img"
                  ? "image"
                  : role === "img" || tag === "figure"
                    ? "chart"
                    : "unclassified";
  const selector =
    kind === "table" || kind === "grid"
      ? 'tr,[role="row"]'
      : kind === "list"
        ? 'li,[role="listitem"],[role="option"]'
        : kind === "tree"
          ? '[role="treeitem"]'
          : "text,tspan,figcaption";
  const nodes = Array.from(element.querySelectorAll(selector)).filter(
    visibleComponent,
  );
  const headers = Array.from(
    element.querySelectorAll('th,[role="columnheader"]'),
  )
    .slice(0, 20)
    .map(safeComponentText);
  const allRows = nodes.slice(0, 10000).map((node) => {
    const cells = Array.from(
      node.querySelectorAll(
        'td,th,[role="cell"],[role="gridcell"],[role="columnheader"]',
      ),
    );
    return cells.length
      ? cells
          .slice(0, 20)
          .map((cell, index) =>
            sensitive.test(headers[index] ?? "")
              ? "[REDACTED]"
              : safeComponentText(cell),
          )
      : [safeComponentText(node)];
  });
  const rawTotal =
    element.getAttribute("aria-rowcount") ??
    element.getAttribute("aria-setsize");
  const total =
    rawTotal && /^\d+$/.test(rawTotal) ? Number(rawTotal) : undefined;
  const scroll =
    element.scrollHeight > element.clientHeight + 2 &&
    /auto|scroll/.test(
      element.ownerDocument.defaultView?.getComputedStyle(element).overflowY ??
        "",
    );
  const pagination = !!element.querySelector(
    'nav,[role="navigation"],.pagination',
  );
  const collapsed = !!element.querySelector('[aria-expanded="false"]');
  const complete =
    ["table", "grid", "list"].includes(kind) &&
    !scroll &&
    !pagination &&
    !collapsed &&
    nodes.length <= 10000 &&
    nodes.every(
      (node) =>
        (node.textContent?.length ?? 0) <= 4000 &&
        node.querySelectorAll('td,th,[role="cell"],[role="gridcell"]').length <=
          20,
    ) &&
    (total === undefined || total === nodes.length);
  return {
    kind,
    rows: allRows,
    visible_rows: allRows.filter((_row, index) => {
      const rect = nodes[index]!.getBoundingClientRect();
      return (
        rect.bottom > Math.max(0, element.getBoundingClientRect().top) &&
        rect.top < element.getBoundingClientRect().bottom &&
        rect.top < (element.ownerDocument.defaultView?.innerHeight ?? Infinity)
      );
    }),
    total,
    scroll,
    pagination,
    collapsed,
    complete,
    description: safeComponentText(element),
    headers,
    hint_basis: `tag:${tag};role:${["grid", "tree", "table", "list", "listbox", "img", "region", "graphics-document"].includes(role ?? "") ? role : "unclassified"}`,
  };
};
export const safeVisionPage = (doc: Document): boolean =>
  !Array.from(
    doc.querySelectorAll(
      "input,textarea,select,[contenteditable],a,[aria-label],[name],[autocomplete],td,th,[role=cell],[role=gridcell]",
    ),
  ).some(
    (el) =>
      visibleComponent(el) &&
      (sensitiveComponentElement(el) ||
        el.matches("input,textarea,select,[contenteditable]") ||
        sensitive.test(
          [
            el.id,
            el.getAttribute("name"),
            el.getAttribute("aria-label"),
            el.getAttribute("autocomplete"),
            el.getAttribute("href"),
          ].join(" "),
        )),
  ) && maskComponentRows([doc.body?.innerText ?? ""]).redacted_count === 0;
