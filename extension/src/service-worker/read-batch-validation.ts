import type {
  ModelSemanticSnapshot,
  PageReadScope,
} from "../contracts/types.js";
import { fail, isPlainObject } from "../security/validation.js";

export type ReadBatchItem =
  | { tool: "read_page"; arguments: Record<string, unknown> }
  | { tool: "get_page_text"; arguments: Record<string, unknown> }
  | { tool: "find"; arguments: Record<string, unknown> };

const scopes = new Set<PageReadScope>([
  "all_dom",
  "visible_only",
  "interactive",
]);
const integerBetween = (
  value: unknown,
  lower: number,
  upper: number,
): boolean =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= lower &&
  value <= upper;

/** Validate the entire batch before evaluating any item. */
export const validateReadBatchItems = (
  snapshot: ModelSemanticSnapshot,
  value: unknown,
): ReadBatchItem[] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 8)
    return fail("INVALID_ARGUMENT");
  return value.map((item) => {
    if (
      !isPlainObject(item) ||
      Object.keys(item).some((key) => key !== "tool" && key !== "arguments") ||
      !isPlainObject(item.arguments)
    )
      return fail("INVALID_ARGUMENT");
    const args = item.arguments;
    if (item.tool === "read_page") {
      if (
        Object.keys(args).some(
          (key) =>
            !["scope", "parent_model_ref", "depth", "max_chars"].includes(key),
        ) ||
        (args.scope !== undefined &&
          !scopes.has(args.scope as PageReadScope)) ||
        (args.parent_model_ref !== undefined &&
          (typeof args.parent_model_ref !== "string" ||
            !snapshot.nodes.some(
              (node) => node.model_ref === args.parent_model_ref,
            ))) ||
        (args.depth !== undefined &&
          (!integerBetween(args.depth, 0, 15) ||
            args.parent_model_ref === undefined)) ||
        (args.max_chars !== undefined &&
          !integerBetween(args.max_chars, 1, 200_000))
      )
        return fail("INVALID_ARGUMENT");
      return { tool: item.tool, arguments: args };
    }
    if (item.tool === "get_page_text") {
      if (
        Object.keys(args).some((key) => key !== "max_chars") ||
        (args.max_chars !== undefined &&
          !integerBetween(args.max_chars, 1, 50_000))
      )
        return fail("INVALID_ARGUMENT");
      return { tool: item.tool, arguments: args };
    }
    if (item.tool === "find") {
      if (
        Object.keys(args).some(
          (key) => !["query", "scope", "limit"].includes(key),
        ) ||
        typeof args.query !== "string" ||
        !args.query.trim() ||
        args.query.length > 512 ||
        (args.scope !== undefined &&
          !scopes.has(args.scope as PageReadScope)) ||
        (args.limit !== undefined && !integerBetween(args.limit, 1, 20))
      )
        return fail("INVALID_ARGUMENT");
      return { tool: item.tool, arguments: args };
    }
    return fail("INVALID_ARGUMENT");
  });
};
