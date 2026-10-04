import {
  traceBranch,
  traceDecision,
  traceMethod,
} from "../diagnostics/method-trace.js";
import {
  describeCoverageGap,
  type ComponentDescriptor,
  type ReadChannel,
} from "./component-descriptor.js";
import { validateReadEvidence, type ReadEvidence } from "./contracts.js";

export type ChannelReadInput = {
  evidence_id: string;
  request_revision: number;
  channel: ReadChannel;
  offset?: number;
  max_items?: number;
};

export const selectChannel = (
  descriptor: ComponentDescriptor,
  requested: ReadChannel,
): { channel: ReadChannel; side_effect: string | null } =>
  traceMethod(
    "page-act-harness/component-facade.ts:selectChannel",
    { observed_hint: descriptor.observed_hint, requested },
    (context) => {
      const entry = descriptor.channels.find(
        (item) => item.channel === requested,
      );
      if (!entry || !entry.available) {
        traceBranch(
          context,
          "page-act-harness/component-facade.ts:selectChannel",
          "fail",
          requested,
          entry?.reason ?? "channel unavailable",
        );
        throw new Error(`CHANNEL_UNSUPPORTED:${requested}`);
      }
      const side_effect =
        requested === "bounded_scroll" || requested === "continuation"
          ? (descriptor.side_effect ?? "DOM_MUTATION_SCROLL")
          : null;
      traceDecision("page-act-harness.component.channel_selected", {
        requested,
        side_effect,
      });
      return { channel: requested, side_effect };
    },
  );

export const readChannel = (
  descriptor: ComponentDescriptor,
  rows: unknown[],
  input: ChannelReadInput,
): ReadEvidence =>
  traceMethod(
    "page-act-harness/component-facade.ts:readChannel",
    { channel: input.channel },
    () => {
      const selected = selectChannel(descriptor, input.channel);
      if (input.max_items !== undefined) {
        if (!Number.isInteger(input.max_items) || input.max_items < 1)
          throw new Error("INVALID_MAX_ITEMS");
      }
      const maxItems = Math.min(input.max_items ?? rows.length, 200);
      // Visual estimation applies when the caller asked for the visual
      // channel and no value-bearing channel (alt table / reviewed data) is
      // available — decided by channel availability, never by kind name.
      const hasValueChannel = descriptor.channels.some(
        (item) =>
          (item.channel === "alt_table" || item.channel === "reviewed_data") &&
          item.available,
      );
      if (input.channel === "visual" && !hasValueChannel)
        return validateReadEvidence({
          evidence_id: input.evidence_id,
          request_revision: input.request_revision,
          binding_revision: descriptor.binding_revision,
          resource_id: descriptor.resource_id,
          resource_revision: descriptor.binding_revision,
          kind: "component_data",
          status: "AVAILABLE",
          content: {
            channel: selected.channel,
            observed_hint: descriptor.observed_hint,
            rows,
            estimated: true,
          },
          coverage: {
            scope: selected.channel,
            complete: false,
            collected_count: rows.length,
            supplied_count: rows.length,
            truncated: true,
            reason: "VISUAL_ESTIMATE_NOT_VALUE",
          },
          continuation: descriptor.continuation ?? {
            cursor: "alt-table-missing",
            reason: "NEEDS_ALT_SOURCE",
          },
          masking: { applied: true, categories: [], redacted_count: 0 },
          limitations: [
            "visual estimate only; chart values require an alt table or reviewed data channel",
          ],
        });
      const supplied = rows.slice(0, maxItems);
      const hitCap = (input.max_items ?? rows.length) > 200;
      const gap = describeCoverageGap(
        descriptor,
        descriptor.total_count !== undefined
          ? Math.min(supplied.length, descriptor.total_count)
          : supplied.length,
      );
      const totalKnown = descriptor.total_count;
      const belowTotal =
        totalKnown !== undefined && supplied.length < totalKnown;
      const truncated =
        gap.complete === false ||
        supplied.length < rows.length ||
        belowTotal ||
        hitCap;
      const reason = belowTotal
        ? "PARTIAL_WINDOW"
        : hitCap
          ? "CAP_REACHED"
          : truncated
            ? gap.reason
            : "CHANNEL_COMPLETE";
      const evidence = validateReadEvidence({
        evidence_id: input.evidence_id,
        request_revision: input.request_revision,
        binding_revision: descriptor.binding_revision,
        resource_id: descriptor.resource_id,
        resource_revision: descriptor.binding_revision,
        kind: "component_data",
        status: "AVAILABLE",
        content: {
          channel: selected.channel,
          observed_hint: descriptor.observed_hint,
          rows: supplied,
          ...(selected.side_effect
            ? { side_effect: selected.side_effect }
            : {}),
        },
        coverage: {
          scope: selected.channel,
          complete: !truncated,
          collected_count: descriptor.logical_count ?? rows.length,
          supplied_count: supplied.length,
          ...(descriptor.total_count !== undefined
            ? { total_count: descriptor.total_count }
            : {}),
          truncated,
          reason,
        },
        ...(truncated
          ? {
              continuation: descriptor.continuation ?? {
                cursor: `offset:${supplied.length}`,
                reason,
              },
            }
          : {}),
        masking: { applied: true, categories: [], redacted_count: 0 },
        limitations: [
          ...(descriptor.observed_hint === "unclassified"
            ? ["unclassified component; generic DOM/text/visual only"]
            : []),
          ...(descriptor.observed_hint === "svg"
            ? ["path shape alone cannot yield exact values or targets"]
            : []),
          ...(descriptor.observed_hint === "canvas" ||
          descriptor.observed_hint === "image"
            ? ["visual estimate; source data unconfirmed"]
            : []),
          ...(selected.side_effect && descriptor.restoration
            ? [`restoration: ${descriptor.restoration}`]
            : []),
        ],
      });
      traceDecision("page-act-harness.component.read", {
        channel: selected.channel,
        supplied_count: supplied.length,
        total_known: totalKnown ?? null,
        truncated,
        reason,
        has_continuation: truncated,
      });
      return evidence;
    },
  );
