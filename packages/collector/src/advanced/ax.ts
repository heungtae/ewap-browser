import { bytes } from "@contextpilot/codebase-schema";
import { scrub } from "../dom/privacy.js";
export function accessibilityRows(input: unknown): {
  rows: string[][];
  partial: boolean;
} {
  if (bytes(input) > 1048576 || !input || typeof input !== "object")
    throw new Error("AX_BYTE_LIMIT");
  const nodes = (input as { nodes?: unknown }).nodes;
  if (!Array.isArray(nodes) || nodes.length > 5000)
    throw new Error("AX_NODE_LIMIT");
  const rows: string[][] = [];
  for (const raw of nodes.slice(0, 1000)) {
    if (!raw || typeof raw !== "object") continue;
    const node = raw as {
      ignored?: unknown;
      role?: { value?: unknown };
      name?: { value?: unknown };
      properties?: { name?: unknown; value?: { value?: unknown } }[];
    };
    if (
      node.ignored ||
      node.role?.value === "textbox" ||
      node.role?.value === "searchbox" ||
      node.role?.value === "combobox" ||
      node.properties?.some(
        (p) => p.name === "protected" && p.value?.value === true,
      )
    )
      continue;
    if (
      typeof node.role?.value !== "string" ||
      typeof node.name?.value !== "string"
    )
      continue;
    rows.push([scrub(node.role.value, 32), "[NAME_WITHHELD]"]);
  }
  // AX does not establish private DOM ancestry or full tree completeness on its own.
  return { rows, partial: true };
}
