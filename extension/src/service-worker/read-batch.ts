import type { ModelSemanticSnapshot } from "../contracts/types.js";
import { fail, isPlainObject } from "../security/validation.js";
import { findPage, getPageText, readPage } from "./page-read.js";

export type ReadBatchItem =
  | { tool: "read_page"; arguments: Record<string, unknown> }
  | { tool: "get_page_text"; arguments: Record<string, unknown> }
  | { tool: "find"; arguments: Record<string, unknown> };

export const executeReadBatch = (
  snapshot: ModelSemanticSnapshot,
  items: readonly ReadBatchItem[],
): Array<{ tool: ReadBatchItem["tool"]; result: unknown }> => {
  if (items.length < 1 || items.length > 8) return fail("INVALID_ARGUMENT");
  const results: Array<{ tool: ReadBatchItem["tool"]; result: unknown }> = [];
  for (const item of items) {
    if (!isPlainObject(item.arguments)) return fail("INVALID_ARGUMENT");
    if (item.tool === "read_page") {
      results.push({
        tool: item.tool,
        result: readPage(snapshot, item.arguments),
      });
      continue;
    }
    if (item.tool === "get_page_text") {
      const max = item.arguments.max_chars;
      if (
        Object.keys(item.arguments).some((key) => key !== "max_chars") ||
        (max !== undefined &&
          (typeof max !== "number" || !Number.isInteger(max)))
      )
        return fail("INVALID_ARGUMENT");
      results.push({
        tool: item.tool,
        result: getPageText(snapshot, typeof max === "number" ? max : 50_000),
      });
      continue;
    }
    if (item.tool === "find") {
      const { query, scope, limit } = item.arguments;
      if (
        Object.keys(item.arguments).some(
          (key) => !["query", "scope", "limit"].includes(key),
        ) ||
        typeof query !== "string" ||
        (scope !== undefined &&
          scope !== "all_dom" &&
          scope !== "visible_only" &&
          scope !== "interactive") ||
        (limit !== undefined &&
          (typeof limit !== "number" || !Number.isInteger(limit)))
      )
        return fail("INVALID_ARGUMENT");
      results.push({
        tool: item.tool,
        result: findPage(snapshot, query, scope ?? "all_dom", limit ?? 20),
      });
      continue;
    }
    return fail("INVALID_ARGUMENT");
  }
  if (new TextEncoder().encode(JSON.stringify(results)).byteLength > 3_000_000)
    return fail("PAYLOAD_LIMIT_EXCEEDED");
  return results;
};
