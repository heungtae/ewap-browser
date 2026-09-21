import type {
  CollectionReadDescriptor,
  CollectionObjectKind,
  SanitizedCollectionRecord,
} from "../contracts/collection-read-types.js";

const MAX_SAMPLE_ROWS = 5;
const MAX_CELLS_PER_ROW = 20;
const MAX_CELL_TEXT_LENGTH = 200;
const XPATH_MAX_DEPTH = 50;
export const MAX_STATIC_COLLECTION_RECORDS = 10_000;
const DISCOVERED_COLLECTION_TTL_MS = 60_000;
const MAX_DISCOVERED_COLLECTIONS = 128;
const discoveredCollectionTargets = new Map<
  string,
  { element: Element; objectKind: CollectionObjectKind; expiresAt: number }
>();

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
  return isSensitiveElement(cell)
    ? "[REDACTED]"
    : text.slice(0, MAX_CELL_TEXT_LENGTH);
}

const sensitiveName = /password|secret|otp|mfa|인증|비밀번호|token|recovery/i;
const isSensitiveElement = (element: Element): boolean => {
  const input = element.closest("input, textarea, select");
  if (input instanceof HTMLInputElement && input.type === "password")
    return true;
  return sensitiveName.test(
    [
      element.getAttribute("name"),
      element.getAttribute("id"),
      element.getAttribute("autocomplete"),
      element.getAttribute("aria-label"),
      input?.getAttribute("name"),
      input?.getAttribute("id"),
      input?.getAttribute("autocomplete"),
      input?.getAttribute("aria-label"),
    ]
      .filter((value): value is string => !!value)
      .join(" "),
  );
};

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
  const now = Date.now();
  for (const [ref, target] of discoveredCollectionTargets)
    if (target.expiresAt <= now) discoveredCollectionTargets.delete(ref);
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
    discoveredCollectionTargets.set(descriptor.collection_ref, {
      element,
      objectKind,
      expiresAt: now + DISCOVERED_COLLECTION_TTL_MS,
    });
    while (discoveredCollectionTargets.size > MAX_DISCOVERED_COLLECTIONS) {
      const oldest = discoveredCollectionTargets.keys().next().value;
      if (oldest === undefined) break;
      discoveredCollectionTargets.delete(oldest);
    }
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

export type StaticCollectionRead = {
  records: readonly SanitizedCollectionRecord[];
  total_rows: number;
  truncated: boolean;
};

export type CollectionWindowRead = {
  records: readonly SanitizedCollectionRecord[];
};

/** Removes the short-lived content-script reference when a read run ends. */
export function releaseCollection(collectionRef: string): void {
  discoveredCollectionTargets.delete(collectionRef);
}

/** Drops all page-bound references after a document or scope transition. */
export function releaseAllCollections(): void {
  discoveredCollectionTargets.clear();
}

const rowsFor = (
  element: Element,
  objectKind: CollectionObjectKind,
): SanitizedCollectionRecord[] => {
  const rowSelector =
    objectKind === "list"
      ? "li, [role=listitem], [role=option]"
      : "tr, [role=row]";
  const records: SanitizedCollectionRecord[] = [];
  for (const row of element.querySelectorAll(rowSelector)) {
    const record = extractRowData(row, objectKind);
    if (
      objectKind === "grid" &&
      !record?.row_id &&
      record?.aria_row_index === 1
    )
      continue;
    if (record) records.push({ ...record, index: records.length });
  }
  return records;
};

/**
 * Returns only the rows mounted in the current virtualized DOM window. The
 * collection reference remains content-script-local until the worker restores
 * the original scroll position and ends the bounded run.
 */
export function readCollectionWindow(
  collectionRef: string,
): CollectionWindowRead | null {
  const target = discoveredCollectionTargets.get(collectionRef);
  if (
    !target ||
    target.expiresAt <= Date.now() ||
    !target.element.isConnected ||
    !["table", "grid", "list"].includes(target.objectKind)
  )
    return null;

  return { records: rowsFor(target.element, target.objectKind) };
}

/**
 * Reads only currently mounted, accessible evidence. Charts never infer data
 * from pixels; SVG text is viewport context and canvas yields no records.
 */
export function readCollectionViewport(
  collectionRef: string,
): CollectionWindowRead | null {
  const target = discoveredCollectionTargets.get(collectionRef);
  if (!target || target.expiresAt <= Date.now() || !target.element.isConnected)
    return null;
  if (["table", "grid", "list"].includes(target.objectKind))
    return readCollectionWindow(collectionRef);
  if (target.objectKind !== "chart_svg") return { records: [] };

  const records: SanitizedCollectionRecord[] = [];
  for (const element of target.element.querySelectorAll(
    "text, tspan, [role=img], [role=cell], [role=gridcell]",
  )) {
    const text = extractCellText(element);
    if (text && records.length < MAX_SAMPLE_ROWS * 20)
      records.push({ index: records.length, cells: [text] });
  }
  return { records };
}

/**
 * Reads only rows that already exist in the current document.  Virtual and
 * paginated objects deliberately do not use this path: a DOM snapshot cannot
 * establish their completeness.
 */
export function readStaticCollection(
  collectionRef: string,
  maxRecords = MAX_STATIC_COLLECTION_RECORDS,
): StaticCollectionRead | null {
  const target = discoveredCollectionTargets.get(collectionRef);
  if (
    !target ||
    target.expiresAt <= Date.now() ||
    !target.element.isConnected ||
    !["table", "grid", "list"].includes(target.objectKind)
  )
    return null;
  // A discovered locator is single-use. Do not retain page element references
  // or permit a cursor to resume after this collection read.
  discoveredCollectionTargets.delete(collectionRef);

  const container = target.element;
  const virtual = hasVirtualScroll(container);
  const paginated = hasPaginationControls(container);
  if (virtual || paginated) return null;

  const rowSelector =
    target.objectKind === "list"
      ? "li, [role=listitem], [role=option]"
      : "tr, [role=row]";
  const rows = Array.from(container.querySelectorAll(rowSelector));
  const records: SanitizedCollectionRecord[] = [];
  for (const row of rows) {
    if (records.length >= maxRecords) break;
    const record = extractRowData(row, target.objectKind);
    if (record) {
      record.index = records.length;
      records.push(record);
    }
  }
  return {
    records,
    total_rows: rows.length,
    truncated: rows.length > records.length,
  };
}
