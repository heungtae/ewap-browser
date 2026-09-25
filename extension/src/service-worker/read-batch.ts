import type { ModelSemanticSnapshot } from "../contracts/types.js";
import { fail } from "../security/validation.js";
import { findPage, getPageText, readPage } from "./page-read.js";
import {
  validateReadBatchItems,
  type ReadBatchItem,
} from "./read-batch-validation.js";

export type { ReadBatchItem } from "./read-batch-validation.js";

type Options = { signal?: AbortSignal; now?: () => number };
const maxBytes = 3_000_000;
const maxDurationMs = 30_000;

/** Snapshot-only reads: validate every item before computing any result. */
export const executeReadBatch = (
  snapshot: ModelSemanticSnapshot,
  items: unknown,
  options: Options = {},
): Array<{ tool: ReadBatchItem["tool"]; result: unknown }> => {
  const validated = validateReadBatchItems(snapshot, items);
  const now = options.now ?? Date.now;
  const started = now();
  const check = (): void => {
    if (options.signal?.aborted) return fail("POLICY_DENIED");
    if (now() - started > maxDurationMs) return fail("REQUEST_TIMEOUT");
  };
  const results: Array<{ tool: ReadBatchItem["tool"]; result: unknown }> = [];
  check();
  for (const item of validated) {
    check();
    const args = item.arguments;
    const result =
      item.tool === "read_page"
        ? readPage(snapshot, args)
        : item.tool === "get_page_text"
          ? getPageText(
              snapshot,
              typeof args.max_chars === "number" ? args.max_chars : 50_000,
            )
          : findPage(
              snapshot,
              args.query as string,
              (args.scope as "all_dom" | "visible_only" | "interactive") ??
                "all_dom",
              typeof args.limit === "number" ? args.limit : 20,
            );
    results.push({ tool: item.tool, result });
    if (new TextEncoder().encode(JSON.stringify(results)).byteLength > maxBytes)
      return fail("PAYLOAD_LIMIT_EXCEEDED");
    check();
  }
  return results;
};
