import type {
  CollectionReadDescriptor,
  CollectionObjectKind,
  SanitizedCollectionRecord,
} from "../contracts/collection-read-types.js";

const MAX_SAMPLE_ROWS = 5;
const MAX_CELLS_PER_ROW = 20;
const MAX_CELL_TEXT_LENGTH = 200;
const XPATH_MAX_DEPTH = 50;

const PAGINATION_SELECTOR =
  "[role=navigation], nav, .pagination, [aria-label*=page i], [aria-label*=paging i]";

function getXPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  let depth = 0;

  while (current && current !== document.body && depth < XPATH_MAX_DEPTH) {
    const tagName = current.tagName.toLowerCase();
    let part = tagName;
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child: Element) => child.tagName.toLowerCase() === tagName,
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        part += `[${index}]`;
      }
    }
    if (current.id) {
      part += `[@id="${current.id}"]`;
    }
    parts.unshift(part);
    current = parent;
    depth++;
  }

  return parts.length > 0 ? "/" + parts.join("/") : "/body";
}

function getAriaAttributes(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const attr of element.attributes) {
    if (attr.name.startsWith("aria-")) {
      attrs[attr.name] = attr.value.slice(0, 200);
    }
  }
  return attrs;
}

function getRoles(element: Element): string[] {
  const roles = new Set<string>();
  const role = element.getAttribute("role");
  if (role) roles.add(role);

  for (const child of element.querySelectorAll("[role]")) {
    const childRole = child.getAttribute("role");
    if (childRole) roles.add(childRole);
  }

  return Array.from(roles).slice(0, 20);
}

function extractCellText(cell: Element): string {
  const text = cell.textContent?.trim() ?? "";
  return text.slice(0, MAX_CELL_TEXT_LENGTH);
}

function extractRowData(
  row: Element,
  objectKind: CollectionObjectKind,
): SanitizedCollectionRecord | null {
  let cells: Element[] = [];

  if (objectKind === "table" || objectKind === "grid") {
    cells = Array.from(
      row.querySelectorAll(
        "td, th, [role=cell], [role=gridcell], [role=columnheader], [role=rowheader]",
      ),
    );
  } else if (objectKind === "list") {
    cells = [row];
  } else {
    cells = Array.from(row.children);
  }

  if (cells.length === 0) return null;

  const cellTexts = cells.slice(0, MAX_CELLS_PER_ROW).map(extractCellText);

  const rowId = row.getAttribute("data-row-id") ?? row.id ?? undefined;
  const ariaRowIndexAttr = row.getAttribute("aria-rowindex");
  const ariaPosInSetAttr = row.getAttribute("aria-posinset");
  const ariaSetSizeAttr = row.getAttribute("aria-setsize");

  const ariaRowIndex = ariaRowIndexAttr
    ? parseInt(ariaRowIndexAttr, 10)
    : undefined;
  const ariaPosInSet = ariaPosInSetAttr
    ? parseInt(ariaPosInSetAttr, 10)
    : undefined;
  const ariaSetSize = ariaSetSizeAttr
    ? parseInt(ariaSetSizeAttr, 10)
    : undefined;

  return {
    index: 0,
    cells: cellTexts as readonly string[],
    row_id: rowId ?? undefined,
    aria_row_index: ariaRowIndex ?? undefined,
    aria_pos_in_set: ariaPosInSet ?? undefined,
    aria_set_size: ariaSetSize ?? undefined,
  };
}

function detectObjectKind(element: Element): CollectionObjectKind | null {
  const role = element.getAttribute("role");
  const tag = element.tagName.toLowerCase();

  if (role === "table" || tag === "table") return "table";
  if (role === "grid") return "grid";
  if (
    role === "list" ||
    role === "listbox" ||
    role === "feed" ||
    tag === "ul" ||
    tag === "ol"
  )
    return "list";

  const hasPagination = element.querySelector(PAGINATION_SELECTOR);
  if (hasPagination) return "pagination";

  if (tag === "svg" || element.querySelector("svg")) return "chart_svg";
  if (tag === "canvas" || element.querySelector("canvas"))
    return "chart_canvas";

  return null;
}

function hasVirtualScroll(element: Element): boolean {
  const style = getComputedStyle(element);
  const hasOverflow =
    style.overflow === "auto" ||
    style.overflow === "scroll" ||
    style.overflowY === "auto" ||
    style.overflowY === "scroll";

  if (!hasOverflow) return false;

  const children = element.children;
  if (children.length === 0) return false;

  const firstChild = children[0] as HTMLElement;
  const lastChild = children[children.length - 1] as HTMLElement;

  const containerHeight = element.clientHeight;
  const contentHeight =
    lastChild.offsetTop + lastChild.offsetHeight - firstChild.offsetTop;

  return contentHeight > containerHeight * 2;
}

function hasPaginationControls(element: Element): boolean {
  return !!element.querySelector(PAGINATION_SELECTOR);
}

function getEstimatedTotal(element: Element): number | undefined {
  const ariaRowCount = element.getAttribute("aria-rowcount");
  if (ariaRowCount) {
    const parsed = parseInt(ariaRowCount, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  const ariaSetSize = element.getAttribute("aria-setsize");
  if (ariaSetSize) {
    const parsed = parseInt(ariaSetSize, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  return undefined;
}

export function discoverCollections(
  root: Element = document.body,
): CollectionReadDescriptor[] {
  const candidates: CollectionReadDescriptor[] = [];
  const seen = new WeakSet<Element>();

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node as Element;
    if (seen.has(element)) continue;

    const objectKind = detectObjectKind(element);
    if (!objectKind) continue;

    const rect = element.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) continue;

    const sampleRows: SanitizedCollectionRecord[] = [];
    let rowIndex = 0;

    let rowSelector = "";
    if (objectKind === "table" || objectKind === "grid") {
      rowSelector = "tr, [role=row]";
    } else if (objectKind === "list") {
      rowSelector = "li, [role=listitem], [role=option]";
    } else {
      rowSelector = "*";
    }

    for (const row of element.querySelectorAll(rowSelector)) {
      if (sampleRows.length >= MAX_SAMPLE_ROWS) break;
      const rowData = extractRowData(row as Element, objectKind);
      if (rowData) {
        rowData.index = rowIndex++;
        sampleRows.push(rowData);
      }
    }

    if (sampleRows.length === 0) continue;

    const estimatedTotal = getEstimatedTotal(element);
    const descriptor: CollectionReadDescriptor = {
      collection_ref: crypto.randomUUID(),
      object_kind: objectKind,
      container_selector: "",
      container_xpath: getXPath(element),
      container_rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      estimated_total: estimatedTotal ?? undefined,
      has_virtual_scroll: hasVirtualScroll(element),
      has_pagination: hasPaginationControls(element),
      aria_attributes: getAriaAttributes(element),
      roles: getRoles(element),
      sample_row_count: sampleRows.length,
      sample_rows: sampleRows,
    };

    candidates.push(descriptor);
    seen.add(element);
  }

  return candidates;
}

export function findCollectionByXPath(
  xpath: string,
): CollectionReadDescriptor | null {
  try {
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null,
    );
    const element = result.singleNodeValue as Element | null;
    if (!element) return null;

    const objectKind = detectObjectKind(element);
    if (!objectKind) return null;

    return discoverCollections(element)[0] ?? null;
  } catch {
    return null;
  }
}
