import { denied, privateAncestor, scrub } from "../dom/privacy.js";
export function cellText(
  element: Element,
  limit = 4096,
  deadline = Date.now() + 10000,
): string {
  let host: Element | null = element;
  for (let depth = 0; host && depth < 8; depth++) {
    if (privateAncestor(host)) throw new Error("TABLE_DENIED");
    const root = host.getRootNode();
    host = "host" in root ? (root as ShadowRoot).host : null;
  }
  if (host) throw new Error("TABLE_DEPTH_LIMIT");
  let value = "",
    count = 0;
  const walker = element.ownerDocument.createTreeWalker(element, 5);
  let node: Node | null = walker.nextNode();
  while (node) {
    if (Date.now() >= deadline) throw new Error("UNIT_TIMEOUT");
    if (++count > 64) throw new Error("CELL_NODE_LIMIT");
    if (
      node.nodeType === 1 &&
      (denied(node as Element) ||
        ["INPUT", "TEXTAREA", "SELECT", "IFRAME", "TABLE"].includes(
          (node as Element).tagName,
        ))
    )
      throw new Error("TABLE_DENIED");
    if (
      node.nodeType === 1 &&
      ((node as Element).tagName.includes("-") || (node as Element).shadowRoot)
    )
      throw new Error("CELL_SHADOW_UNAVAILABLE");
    if (node.nodeType === 3) {
      const text = node as Text;
      if (value.length + text.length > limit) throw new Error("CELL_LIMIT");
      value += text.data;
    }
    node = walker.nextNode();
  }
  return scrub(value, limit);
}
