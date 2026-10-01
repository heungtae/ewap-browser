import { isPlainObject } from "../security/validation.js";

/** Reviewed bundled fixture only. Discovery candidates never register adapters. */
export const fixturePageApiReadAdapter = {
  adapter_id: "fixture_summary",
  version: 1,
  origin: "https://page-api-fixture.invalid",
  path: "/variant",
  option_ids: ["summary"] as const,
};
export type PageApiReadContext = {
  source: { kind: "page_api_read"; label: "reviewed page summary" };
  coverage: "complete" | "partial";
  collected_count: number;
  records: { index: number; cells: string[] }[];
  truncated: boolean;
};

/** Serialized into MAIN; fixed property accesses, enum only, no URLs or selectors. */
export const readFixturePageApi = async (option: string): Promise<unknown> => {
  if (
    option !== "summary" ||
    location.origin !== "https://page-api-fixture.invalid" ||
    location.pathname !== "/variant"
  )
    return undefined;
  const root = Object.getOwnPropertyDescriptor(globalThis, "appData")?.value;
  if (!root || Object.getOwnPropertyDescriptor(root, "apiVersion")?.value !== 1)
    return undefined;
  const read = Object.getOwnPropertyDescriptor(root, "readSummary")?.value;
  if (typeof read !== "function") return undefined;
  const result = await read.call(root, option);
  if (
    !result ||
    typeof result !== "object" ||
    Object.keys(result).some(
      (key) => !["records", "total", "eof"].includes(key),
    ) ||
    !Array.isArray(result.records) ||
    result.records.length > 200 ||
    !Number.isSafeInteger(result.total) ||
    result.total < result.records.length ||
    typeof result.eof !== "boolean"
  )
    return undefined;
  if (
    !result.records.every((row: unknown) => {
      if (!row || typeof row !== "object") return false;
      const item = row as { category?: unknown; count?: unknown };
      return (
        Object.keys(row).length === 2 &&
        typeof item.category === "string" &&
        item.category.length <= 160 &&
        Number.isSafeInteger(item.count) &&
        (item.count as number) >= 0
      );
    })
  )
    return undefined;
  const bounded = {
    records: result.records.map((row: { category: string; count: number }) => ({
      category: row.category,
      count: row.count,
    })),
    total: result.total,
    eof: result.eof,
  };
  return new TextEncoder().encode(JSON.stringify(bounded)).byteLength <=
    32 * 1024
    ? bounded
    : undefined;
};

/** The raw MAIN result is worker-local and never used as invocation authority. */
export const validatePageApiReadResult = (
  value: unknown,
): PageApiReadContext | undefined => {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some(
      (key) => !["records", "total", "eof"].includes(key),
    ) ||
    !Array.isArray(value.records) ||
    value.records.length > 200 ||
    !Number.isSafeInteger(value.total) ||
    (value.total as number) < value.records.length ||
    typeof value.eof !== "boolean" ||
    (value.eof && value.total !== value.records.length)
  )
    return;
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 32 * 1024)
    return;
  const records: PageApiReadContext["records"] = [];
  let truncated = false;
  for (const [index, row] of value.records.entries()) {
    if (
      !isPlainObject(row) ||
      Object.keys(row).length !== 2 ||
      typeof row.category !== "string" ||
      row.category.length > 160 ||
      !Number.isSafeInteger(row.count) ||
      (row.count as number) < 0
    )
      return;
    if (index >= 100) {
      truncated = true;
      continue;
    }
    const category = row.category
      .split("")
      .map((character) =>
        character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
          ? " "
          : character,
      )
      .join("")
      .trim();
    // This fixture schema contains categories, never links or credential-like fields.
    if (
      /https?:\/\/|\b(?:bearer|password|token|api[_ -]?key)\b/i.test(category)
    )
      return;
    records.push({ index, cells: [category, String(row.count)] });
  }
  return {
    source: { kind: "page_api_read", label: "reviewed page summary" },
    coverage: value.eof && !truncated ? "complete" : "partial",
    collected_count: value.records.length,
    records,
    truncated,
  };
};
