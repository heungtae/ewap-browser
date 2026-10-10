import { opaqueId } from "../security/canonical.js";
import { readChannel } from "../page-act-harness/component-facade.js";
import type {
  ComponentDescriptor,
  ReadChannel,
} from "../page-act-harness/component-descriptor.js";
export type ComponentCursor = {
  id: string;
  revision: string;
  channel: string;
  offset: number;
};
export const componentReadWindow = (opts: {
  descriptor: ComponentDescriptor;
  rows: unknown[];
  args: Record<string, unknown>;
  requestRevision: number;
  offset: number;
  size: number;
  restored?: boolean;
  cursors: Map<string, ComponentCursor>;
}) => {
  const { descriptor, rows, args, requestRevision, offset, size, cursors } =
    opts;
  const evidence = readChannel(descriptor, rows, {
    evidence_id: opaqueId(),
    request_revision: requestRevision,
    channel: args.channel as ReadChannel,
    offset,
    max_items: size,
  });
  const nextOffset = offset + (evidence.coverage.supplied_count ?? 0);
  const cursor = nextOffset < rows.length ? opaqueId() : undefined;
  if (cursor)
    cursors.set(cursor, {
      id: String(args.resource_id),
      revision: String(args.resource_revision),
      channel: String(args.channel),
      offset: nextOffset,
    });
  return {
    ...evidence,
    status: opts.restored === false ? "INCOMPLETE" : evidence.status,
    ...(opts.restored === false ? { code: "RESTORATION_FAILED" } : {}),
    limitations: [
      ...evidence.limitations,
      ...(args.channel === "alt_table"
        ? ["EXPLICIT_DOM_ASSOCIATION_NOT_VALUE_CORROBORATION"]
        : []),
    ],
    coverage: {
      ...evidence.coverage,
      complete:
        opts.restored !== false && offset === 0 && evidence.coverage.complete,
      truncated: offset > 0 || evidence.coverage.truncated,
      eof_observed: descriptor.has_eof && nextOffset >= rows.length,
      reason: offset > 0 ? "PARTIAL_WINDOW" : evidence.coverage.reason,
      window_offset: offset,
    },
    progress: {
      supplied_through: nextOffset,
      complete:
        opts.restored !== false &&
        descriptor.has_eof &&
        descriptor.total_count !== undefined &&
        rows.length >= descriptor.total_count &&
        nextOffset >= descriptor.total_count,
    },
    ...(opts.restored === undefined
      ? {}
      : { restored_position: opts.restored }),
    continuation: cursor
      ? {
          cursor,
          reason: "PARTIAL_WINDOW",
          tool: "read_component_data",
          arguments: {
            resource_id: args.resource_id,
            resource_revision: args.resource_revision,
            channel: args.channel,
            cursor,
            max_items: size,
          },
        }
      : null,
  };
};
