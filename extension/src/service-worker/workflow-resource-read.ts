import type { createWorkflowResourceStore } from "./workflow-resource-store.js";
export type WorkflowResourceCursor = {
  kind: string;
  offset: number;
  source?: string;
  resource?: string;
};
export const readWorkflowResource = (
  store: ReturnType<typeof createWorkflowResourceStore>[number],
  args: Record<string, unknown>,
  position: WorkflowResourceCursor | undefined,
  cursor: (value: WorkflowResourceCursor) => string,
  requestRevision: number,
): unknown => {
  if (position && position.resource !== store.metadata.resource_id)
    throw Error("INVALID_CURSOR");
  const size = args.max_bytes ?? 8192;
  if (
    typeof size !== "number" ||
    !Number.isInteger(size) ||
    size < 256 ||
    size > 16384
  )
    throw Error("INVALID_ARGUMENT");
  const start = position?.offset ?? 0;
  let end = Math.min(start + size, store.bytes.length);
  while (end < store.bytes.length && ((store.bytes[end] ?? 0) & 192) === 128)
    end--;
  const chunk = new TextDecoder("utf-8", { fatal: true }).decode(
    store.bytes.slice(start, end),
  );
  if (start <= store.readUntil)
    store.readUntil = Math.max(store.readUntil, end);
  const next =
    end < store.bytes.length
      ? cursor({
          kind: "read_workflow_resource",
          offset: end,
          resource: store.metadata.resource_id,
        })
      : null;
  return {
    status: "AVAILABLE",
    ...store.metadata,
    request_revision: requestRevision,
    source_text: chunk,
    encoding: "masked_utf8",
    byte_offset: start,
    next_cursor: next,
    masking: { applied: true },
    coverage: {
      complete: store.readUntil === store.bytes.length,
      truncated: next !== null,
      read_bytes: store.readUntil,
      total_bytes: store.bytes.length,
    },
    ...(next
      ? {
          continuation: {
            tool: "read_workflow_resource",
            arguments: {
              resource_id: store.metadata.resource_id,
              resource_revision: store.metadata.resource_revision,
              cursor: next,
              max_bytes: size,
            },
          },
        }
      : {}),
  };
};
