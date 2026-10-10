import {
  readWorkflowResource,
  type WorkflowResourceCursor,
} from "./workflow-resource-read.js";
import type { CandidateDefinition } from "./workflow-catalog-runtime.js";
import { opaqueId } from "../security/canonical.js";
import { isPlainObject } from "../security/validation.js";
import {
  createWorkflowResourceStore,
  workflowResourceKey,
  workflowResourceRevision,
} from "./workflow-resource-store.js";
import { workflowResourceToolSchemas } from "./workflow-resource-schemas.js";
export { workflowResourceToolSchemas } from "./workflow-resource-schemas.js";

export type WorkflowResourceOptions = {
  load(): Promise<CandidateDefinition[]>;
  current(): boolean;
  requestRevision: number;
  signal?: AbortSignal;
};
export const createWorkflowResourceExecutor = (
  opts: WorkflowResourceOptions,
) => {
  let stores: ReturnType<typeof createWorkflowResourceStore> | undefined;
  const cursors = new Map<string, WorkflowResourceCursor>();
  const listed = new Set<string>();
  const cursor = (value: WorkflowResourceCursor) => {
    const id = opaqueId();
    cursors.set(id, value);
    return id;
  };
  const fresh = async () => {
    if (opts.signal?.aborted || !opts.current()) throw Error("STALE");
    const items = await opts.load();
    if (opts.signal?.aborted || !opts.current()) throw Error("STALE");
    if (!stores) stores = createWorkflowResourceStore(items);
    const revisions = new Map(
      items.map((item) => [
        workflowResourceKey(item),
        workflowResourceRevision(item),
      ]),
    );
    if (
      stores.length !== items.length ||
      stores.some((store) => revisions.get(store.key) !== store.revision)
    )
      throw Error("STALE");
    return stores;
  };
  return {
    tools: workflowResourceToolSchemas,
    async reviewReady(
      declaration: CandidateDefinition["declaration"],
      candidateId?: string,
    ): Promise<boolean> {
      const data = await fresh();
      return data.some(
        (store) =>
          (candidateId === undefined ||
            store.metadata.candidate_id === candidateId) &&
          JSON.stringify(store.item.declaration) ===
            JSON.stringify(declaration) &&
          store.metadata.readable &&
          store.metadata.original_complete &&
          store.readUntil === store.bytes.length,
      );
    },
    async execute(call: { name: string; args: string }): Promise<unknown> {
      try {
        const args: unknown = JSON.parse(call.args);
        const schema = workflowResourceToolSchemas.find(
          (tool) => tool.function.name === call.name,
        );
        if (!isPlainObject(args) || !schema) throw Error("INVALID_ARGUMENT");
        const properties = schema.function.parameters.properties as Record<
          string,
          unknown
        >;
        if (
          Object.keys(args).some(
            (key) => !Object.prototype.hasOwnProperty.call(properties, key),
          )
        )
          throw Error("INVALID_ARGUMENT");
        for (const key of ["source", "cursor", "page_size", "max_bytes"])
          if (args[key] === null) delete args[key];
        const data = await fresh();
        const position =
          args.cursor === undefined
            ? undefined
            : typeof args.cursor === "string"
              ? cursors.get(args.cursor)
              : undefined;
        if (
          args.cursor !== undefined &&
          (!position || position.kind !== call.name)
        )
          throw Error("INVALID_CURSOR");
        if (call.name === "list_workflow_resources") {
          const source = args.source;
          if (
            source !== undefined &&
            !["saved", "profile", "page_generated"].includes(String(source))
          )
            throw Error("INVALID_ARGUMENT");
          if (position && position.source !== source)
            throw Error("INVALID_CURSOR");
          const size = args.page_size ?? 20;
          if (
            typeof size !== "number" ||
            !Number.isInteger(size) ||
            size < 1 ||
            size > 50
          )
            throw Error("INVALID_ARGUMENT");
          const filtered = data.filter(
            (item) => source === undefined || item.metadata.source === source,
          );
          const start = position?.offset ?? 0,
            end = Math.min(start + size, filtered.length);
          const page = filtered.slice(start, end);
          page.forEach((item) => listed.add(item.metadata.resource_id));
          const next =
            end < filtered.length
              ? cursor({
                  kind: call.name,
                  offset: end,
                  ...(typeof source === "string" ? { source } : {}),
                })
              : null;
          return {
            status: "AVAILABLE",
            request_revision: opts.requestRevision,
            resources: page.map((item) => item.metadata),
            next_cursor: next,
            coverage: {
              complete: next === null,
              truncated: next !== null,
              scope: typeof source === "string" ? source : "all_sources",
              inspected: end,
              total: filtered.length,
            },
            ...(next
              ? {
                  continuation: {
                    tool: call.name,
                    arguments: {
                      ...(source ? { source } : {}),
                      cursor: next,
                      page_size: size,
                    },
                  },
                }
              : {}),
          };
        }
        const store = data.find(
          (item) => item.metadata.resource_id === args.resource_id,
        );
        if (!store || !listed.has(store.metadata.resource_id))
          throw Error("NOT_FOUND");
        if (args.resource_revision !== store.metadata.resource_revision)
          throw Error("STALE");
        if (!store.metadata.readable)
          return { status: "UNSUPPORTED", ...store.metadata };
        return readWorkflowResource(
          store,
          args,
          position,
          cursor,
          opts.requestRevision,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "READ_FAILED";
        const code = [
          "STALE",
          "NOT_FOUND",
          "INVALID_ARGUMENT",
          "INVALID_CURSOR",
        ].includes(message)
          ? message
          : "READ_FAILED";
        return {
          status:
            code === "STALE"
              ? "STALE"
              : code === "NOT_FOUND"
                ? "NOT_FOUND"
                : "FAILED",
          code,
        };
      }
    },
  };
};
