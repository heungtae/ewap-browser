import { componentDomChannel } from "./component-dom-channel.js";
import { componentRouteChannels } from "./component-route-channels.js";
import {
  componentReadWindow,
  type ComponentCursor as Cursor,
} from "./component-read-window.js";
import { ContractError, isPlainObject } from "../security/validation.js";
import type { ComponentDescriptor } from "../page-act-harness/component-descriptor.js";
import { maskComponentRows } from "../page-act-harness/component-facade.js";
import { componentToolArguments } from "./component-tool-arguments.js";
import type { PageResourceOptions } from "./page-resource-store.js";
import {
  readApprovedComponentCollection,
  componentCollectionRoute,
} from "./component-collection-read.js";

export const createComponentToolExecutor = (
  opts: PageResourceOptions & {
    runId: string;
    allowCollection(): boolean;
    visionEnabled: boolean;
    readVisual?(): Promise<unknown>;
  },
) => {
  const cursors = new Map<string, Cursor>();
  const scrollReads = new Map<
    string,
    Awaited<ReturnType<typeof readApprovedComponentCollection>>
  >();
  return {
    async execute(call: { name: string; args: string }): Promise<unknown> {
      try {
        if (opts.signal?.aborted || !opts.current())
          return { status: "CANCELLED" };
        const args = componentToolArguments(call);
        if (!args) return { status: "FAILED", code: "INVALID_ARGUMENT" };
        const response = await opts.tabs.sendMessage(opts.tabId, {
          kind: "CONTENT_COMPONENT_DESCRIBE",
          document_epoch: opts.documentEpoch,
          resource_id: args.resource_id,
          resource_revision: args.resource_revision,
        });
        if (opts.signal?.aborted || !opts.current())
          return { status: "CANCELLED" };
        if (!isPlainObject(response) || response.status !== "AVAILABLE")
          return { status: "STALE" };
        if (
          response.document_epoch !== opts.documentEpoch ||
          !isPlainObject(response.descriptor) ||
          !Array.isArray(response.rows) ||
          response.rows.length > 10000
        )
          return { status: "FAILED", code: "INVALID_COMPONENT_RESULT" };
        const descriptor = response.descriptor as ComponentDescriptor;
        if (
          descriptor.resource_id !== args.resource_id ||
          descriptor.binding_revision !== args.resource_revision ||
          !Array.isArray(descriptor.channels)
        )
          return { status: "FAILED", code: "INVALID_COMPONENT_RESULT" };
        descriptor.channels = descriptor.channels.map((entry) =>
          entry.channel === "visual"
            ? {
                ...entry,
                available:
                  entry.available && opts.visionEnabled && !!opts.readVisual,
              }
            : entry.channel === "bounded_scroll"
              ? {
                  ...entry,
                  available: entry.available && opts.allowCollection(),
                }
              : entry,
        );
        const selected = await componentCollectionRoute(opts, args).catch(
          () => undefined,
        );
        if (opts.signal?.aborted || !opts.current())
          return { status: "CANCELLED" };
        descriptor.channels = componentRouteChannels(
          descriptor,
          selected?.route.kind,
          opts.allowCollection(),
        );
        if (call.name === "describe_component")
          return {
            status: "AVAILABLE",
            descriptor,
            structure: maskComponentRows([response.structure]).rows[0],
          };
        if (
          typeof args.channel !== "string" ||
          !descriptor.channels.some((entry) => entry.channel === args.channel)
        )
          return { status: "FAILED", code: "INVALID_CHANNEL" };
        if (
          !descriptor.channels.some(
            (entry) => entry.channel === args.channel && entry.available,
          )
        )
          return {
            status: "UNSUPPORTED",
            code: "CHANNEL_UNSUPPORTED",
            channels: descriptor.channels,
          };
        if (args.channel === "visual") {
          const visual = await opts.readVisual!();
          return isPlainObject(visual) && typeof visual.data_url === "string"
            ? { status: "AVAILABLE", ...visual }
            : visual;
        }
        const size = args.max_items ?? 100;
        if (
          typeof size !== "number" ||
          !Number.isInteger(size) ||
          size < 1 ||
          size > 200
        )
          return { status: "FAILED", code: "INVALID_MAX_ITEMS" };
        const position =
          args.cursor === undefined
            ? undefined
            : typeof args.cursor === "string"
              ? cursors.get(args.cursor)
              : undefined;
        if (
          args.cursor !== undefined &&
          (!position ||
            position.id !== args.resource_id ||
            position.revision !== args.resource_revision ||
            position.channel !== args.channel)
        )
          return { status: "FAILED", code: "INVALID_CURSOR" };
        let rows = componentDomChannel(response, descriptor, args.channel);
        let restored: boolean | undefined;
        if (
          args.channel === "bounded_scroll" ||
          args.channel === "reviewed_data"
        ) {
          const key = `${args.resource_id}:${args.resource_revision}:${args.channel}`;
          let read = scrollReads.get(key);
          if (!read) {
            read = await readApprovedComponentCollection(opts, args);
            if (read.status !== "AVAILABLE" || !("result" in read)) return read;
            scrollReads.set(key, read);
          }
          if (!("result" in read) || !read.result) return { status: "FAILED" };
          rows = read.result.records.map((record) => ({ cells: record.cells }));
          descriptor.has_eof = read.result.coverage === "complete";
          descriptor.logical_count = read.result.collected_count;
          const total =
            read.result.source_total_hint ??
            (descriptor.has_eof ? read.result.collected_count : undefined);
          if (total === undefined) delete descriptor.total_count;
          else descriptor.total_count = total;
          restored = read.result.restored_position;
        }
        if (opts.signal?.aborted || !opts.current())
          return { status: "CANCELLED" };
        const offset = position?.offset ?? 0;
        return componentReadWindow({
          descriptor,
          rows,
          args,
          requestRevision: opts.requestRevision,
          offset,
          size,
          cursors,
          ...(restored === undefined ? {} : { restored }),
        });
      } catch (error) {
        return {
          status:
            opts.signal?.aborted || !opts.current() ? "CANCELLED" : "FAILED",
          code:
            error instanceof ContractError
              ? error.code
              : "COMPONENT_READ_FAILED",
        };
      }
    },
  };
};
