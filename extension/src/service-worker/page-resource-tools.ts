import { executePageResourceSearch } from "./page-resource-search.js";
import { createPageResourceProgress } from "./page-resource-progress.js";
import { isPlainObject } from "../security/validation.js";
import { isOpaqueId } from "../page-act-harness/contracts.js";
import { opaqueId } from "../security/canonical.js";
import { readResourceChunk } from "../page-act-harness/resource-reader.js";
import { pageResourceToolSchemas } from "./page-resource-schemas.js";
import {
  createPageResourceStore,
  type PageResourceOptions,
} from "./page-resource-store.js";
export { pageResourceToolSchemas } from "./page-resource-schemas.js";
export const createPageResourceExecutor = (opts: PageResourceOptions) => {
  const resources = createPageResourceStore(opts);
  const progress = createPageResourceProgress();
  const { namespace, stores, cursors, refresh, cursor, position, load, state } =
    resources;
  return {
    bootstrap: resources.bootstrap,
    async execute(call: { name: string; args: string }): Promise<unknown> {
      try {
        const args: unknown = JSON.parse(call.args);
        if (!isPlainObject(args)) throw new Error("INVALID_ARGUMENT");
        const schema = pageResourceToolSchemas.find(
          (tool) => tool.function.name === call.name,
        );
        const parameters = schema?.function.parameters as
          | { properties: Record<string, unknown> }
          | undefined;
        if (
          !parameters ||
          Object.keys(args).some(
            (key) =>
              !Object.prototype.hasOwnProperty.call(parameters.properties, key),
          )
        )
          throw new Error("INVALID_ARGUMENT");
        for (const key of [
          "cursor",
          "page_size",
          "offset",
          "max_bytes",
          "resource_revision",
        ])
          if (args[key] === null) delete args[key];
        const data = await refresh();
        if (
          call.name === "list_page_resources" ||
          call.name === "search_page_resources"
        ) {
          return await executePageResourceSearch(
            resources,
            call.name,
            args,
            data,
            progress,
          );
        }
        if (
          typeof args.resource_id !== "string" ||
          !isOpaqueId(args.resource_id) ||
          (args.resource_revision !== undefined &&
            typeof args.resource_revision !== "string")
        )
          throw new Error("INVALID_ARGUMENT");
        if (
          args.offset !== undefined &&
          (typeof args.offset !== "number" ||
            !Number.isInteger(args.offset) ||
            args.offset < 0 ||
            args.offset > 1024 * 1024 ||
            args.cursor !== undefined ||
            (args.offset > 0 && typeof args.resource_revision !== "string"))
        )
          throw new Error("INVALID_OFFSET");
        const maxBytes = args.max_bytes ?? 8192;
        if (
          typeof maxBytes !== "number" ||
          !Number.isInteger(maxBytes) ||
          maxBytes < 1 ||
          maxBytes > 16384
        )
          throw new Error("INVALID_MAX_BYTES");
        if (args.cursor !== undefined) {
          const value =
            typeof args.cursor === "string"
              ? cursors.get(args.cursor)
              : undefined;
          if (
            !value ||
            value.kind !== call.name ||
            !value.key.startsWith(
              `${namespace}:${data.revision}:${args.resource_id}:`,
            )
          )
            throw new Error("INVALID_CURSOR");
        }
        await load([args.resource_id]);
        const store = stores.get(args.resource_id);
        if (!store) return { status: state(args.resource_id) };
        if (
          args.resource_revision !== undefined &&
          args.resource_revision !== store.revision &&
          !(
            args.cursor === undefined &&
            (args.offset ?? 0) === 0 &&
            args.resource_revision ===
              data.items.find((item) => item.resource_id === store.resource_id)
                ?.revision
          )
        )
          return { status: "STALE", reason: "SOURCE_CHANGED" };
        const key = `${namespace}:${data.revision}:${store.resource_id}:${store.revision}`;
        const offset =
          args.cursor === undefined
            ? ((args.offset as number | undefined) ?? 0)
            : position(args.cursor, call.name, key);
        const evidence = readResourceChunk(store, {
          evidence_id: opaqueId(),
          request_revision: opts.requestRevision,
          binding_revision: data.revision,
          resource_id: store.resource_id,
          offset,
          max_bytes: maxBytes,
          current_revision: store.revision,
        });
        const nextOffset = evidence.continuation?.cursor?.replace(
          "offset:",
          "",
        );
        const nextCursor =
          nextOffset === undefined
            ? undefined
            : cursor(call.name, Number(nextOffset), key);
        const chunkContent = (
          evidence.content as { text?: unknown } | undefined
        )?.text;
        const redactedLines =
          typeof chunkContent === "string"
            ? (chunkContent.match(/\[REDACTED:credential-like\]/g) ?? []).length
            : 0;
        return {
          ...evidence,
          masking: {
            applied: true,
            categories:
              redactedLines > 0
                ? ["credential-like"]
                : evidence.masking.categories,
            redacted_count: evidence.masking.redacted_count + redactedLines,
          },
          coverage: {
            ...evidence.coverage,
            byte_space: "masked_utf8",
            complete: offset === 0 && evidence.coverage.complete,
          },
          ...(nextOffset !== undefined
            ? {
                continuation: {
                  cursor: nextCursor,
                  reason: "CONTINUE_CHUNK",
                  tool: call.name,
                  arguments: {
                    resource_id: store.resource_id,
                    resource_revision: store.revision,
                    cursor: nextCursor,
                    max_bytes: maxBytes,
                  },
                },
              }
            : {}),
        };
      } catch (error) {
        progress.resetOnSourceChange(error);
        return {
          status:
            opts.signal?.aborted || !opts.current()
              ? "CANCELLED"
              : error instanceof Error && error.message === "SOURCE_CHANGED"
                ? "STALE"
                : error instanceof Error &&
                    error.message === "SOURCE_BYTE_BUDGET_EXCEEDED"
                  ? "INCOMPLETE"
                  : "FAILED",
          code: error instanceof Error ? error.message : "RESOURCE_READ_FAILED",
          ...(error instanceof Error && error.message.startsWith("INVALID_")
            ? {
                expected_parameters: pageResourceToolSchemas.find(
                  (tool) => tool.function.name === call.name,
                )?.function.parameters,
                argument_help:
                  "Use JSON integers, not quoted numbers. Omit optional fields for defaults. On a first call omit cursor (do not send None or null strings). For later calls copy this same tool's continuation.arguments exactly; a search cursor belongs only to its original query.",
              }
            : {}),
        };
      }
    },
  };
};
