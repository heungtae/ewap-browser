import { scrub } from "../dom/privacy.js";
export type Scalar = string | number | boolean | null;
// Accept only bounded inert JSON, never a live MAIN object, proxy or getter.
// Trusted composition registers the exact reader/path; providers supply neither.
export function readOwnData(
  serialized: string,
  path: readonly string[],
): Scalar[][] {
  if (path.length > 4) throw new Error("MAIN_DEPTH_LIMIT");
  if (
    typeof serialized !== "string" ||
    new TextEncoder().encode(serialized).length > 262144
  )
    throw new Error("MAIN_INPUT_DENIED");
  let value: unknown = JSON.parse(serialized);
  for (const key of path) {
    if (
      ["__proto__", "prototype", "constructor"].includes(key) ||
      !value ||
      typeof value !== "object"
    )
      throw new Error("MAIN_PATH_DENIED");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor))
      throw new Error("MAIN_ACCESSOR_DENIED");
    value = descriptor.value;
  }
  if (!Array.isArray(value) || value.length > 200)
    throw new Error("MAIN_ROW_LIMIT");
  const rows: Scalar[][] = [];
  for (let i = 0; i < value.length; i++) {
    const rowDescriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (
      !rowDescriptor ||
      !("value" in rowDescriptor) ||
      !Array.isArray(rowDescriptor.value)
    )
      throw new Error("MAIN_ACCESSOR_DENIED");
    const row: unknown[] = rowDescriptor.value;
    if (row.length > 50) throw new Error("MAIN_FIELD_LIMIT");
    const cells: Scalar[] = [];
    for (let j = 0; j < row.length; j++) {
      const d = Object.getOwnPropertyDescriptor(row, String(j));
      if (!d || !("value" in d)) throw new Error("MAIN_ACCESSOR_DENIED");
      const cell: unknown = d.value;
      if (typeof cell === "string") cells.push(scrub(cell, 4096));
      else if (
        cell === null ||
        typeof cell === "boolean" ||
        (typeof cell === "number" && Number.isFinite(cell))
      )
        cells.push(cell);
      else throw new Error("MAIN_VALUE_DENIED");
    }
    rows.push(cells);
  }
  return rows;
}
export function sourceEndpoints(source: string): {
  mentions: string[];
  observed: false;
  executable: false;
} {
  if (new TextEncoder().encode(source).length > 262144)
    throw new Error("SOURCE_BYTE_LIMIT");
  // Static literal hints only. Never evaluate source or derive replay instructions.
  const mentions = [
    ...source.matchAll(
      /(?:fetch|axios\.get)\s*\(\s*["'](\/[A-Za-z0-9/_-]{1,120})["']/g,
    ),
  ]
    .slice(0, 32)
    .map((_m, index) => `source_endpoint_${index + 1}`);
  return {
    mentions: [...new Set(mentions)],
    observed: false,
    executable: false,
  };
}
