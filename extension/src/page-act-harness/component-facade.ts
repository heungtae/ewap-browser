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
const SENSITIVE_KEY =
  /(password|passwd|secret|api[_-]?key|token|otp|mfa|cookie|credential|private[_-]?key|bearer|jwt|ssn)/i;
// Substring match is deliberate (fail-closed): snake_case keys such as
// my_api_key must not slip through on word-boundary technicalities.
// An assignment only redacts when its value looks secret-bearing (long or
// digit-bearing): benign `token: expired` labels pass through.
const ASSIGNMENT_VALUE = /[:=]\s*(\S+)/;
const SECRET_VALUE = /(\S{8,}|[A-Za-z]*\d\S*|\S*\d[A-Za-z]*)/;
const assignmentLike = (value: string): boolean => {
  const keyed =
    /(password|passwd|secret|api[_-]?key|token|otp|mfa|cookie|bearer|jwt)/i.test(
      value,
    );
  if (!keyed) return false;
  const match = ASSIGNMENT_VALUE.exec(value);
  return match !== null && SECRET_VALUE.test(match[1] ?? "");
};
const BEARER_TOKEN = /bearer\s*[:\s]+[A-Za-z0-9\-._~+/=]{8,}/i;
const URL_WITH_QUERY = /(\bhttps?:\/\/[^\s?#]*\?)([^\s#]*)(#\S*)?/;

const maskUrlQuery = (value: string): { value: string; hit: boolean } => {
  const match = URL_WITH_QUERY.exec(value);
  if (!match || !SENSITIVE_KEY.test(match[2] ?? ""))
    return { value, hit: false };
  // Only the secret-bearing query is redacted; path and fragment survive.
  return { value: `${match[1]}[REDACTED:query]${match[3] ?? ""}`, hit: true };
};

// Fail-closed component masking: sensitive keyed fields are redacted, and
// credential-shaped strings (assignments, bearer tokens, secret-bearing
// URLs) are redacted even without a sensitive key. Counts stay honest so
// `masking.applied: true` is never attached to unexamined data.
export const maskComponentRows = (
  rows: unknown[],
): { rows: unknown[]; categories: string[]; redacted_count: number } => {
  let redacted = 0;
  const maskValue = (value: unknown, key?: string): unknown => {
    if (typeof value === "string") {
      if (key !== undefined && SENSITIVE_KEY.test(key)) {
        redacted += 1;
        return "[REDACTED:credential-like]";
      }
      // URLs first: only a secret-bearing query is cut (path/fragment
      // survive). The assignment rule below would redact the whole string.
      const urlMasked = maskUrlQuery(value);
      if (urlMasked.hit) {
        redacted += 1;
        return urlMasked.value;
      }
      if (assignmentLike(value)) {
        redacted += 1;
        return "[REDACTED:credential-like]";
      }
      if (BEARER_TOKEN.test(value)) {
        redacted += 1;
        return value.replace(BEARER_TOKEN, "Bearer [REDACTED]");
      }
      return value;
    }
    if (Array.isArray(value)) return value.map((item) => maskValue(item));
    if (typeof value === "object" && value !== null) {
      const out: Record<string, unknown> = {};
      for (const [entryKey, entryValue] of Object.entries(value))
        out[entryKey] = maskValue(entryValue, entryKey);
      return out;
    }
    if (typeof key === "string" && SENSITIVE_KEY.test(key)) {
      redacted += 1;
      return "[REDACTED:credential-like]";
    }
    return value;
  };
  const masked = rows.map((row) => maskValue(row)) as unknown[];
  return {
    rows: masked,
    categories: redacted > 0 ? ["component-sensitive"] : [],
    redacted_count: redacted,
  };
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
      const offset = input.offset ?? 0;
      if (!Number.isInteger(offset) || offset < 0)
        throw new Error("INVALID_OFFSET");
      if (offset > rows.length) throw new Error("INVALID_OFFSET");
      const maxItems = Math.min(input.max_items ?? rows.length, 200);
      // Visual estimation applies when the caller asked for the visual
      // channel and no value-bearing channel (alt table / reviewed data) is
      // available — decided by channel availability, never by kind name.
      const hasValueChannel = descriptor.channels.some(
        (item) =>
          (item.channel === "alt_table" || item.channel === "reviewed_data") &&
          item.available,
      );
      const masked = maskComponentRows(rows);
      const masking = {
        applied: true,
        categories: masked.categories,
        redacted_count: masked.redacted_count,
      };
      // NOTE: the visual estimate covers all supplied rows; offset/max_items
      // pagination does not apply to this channel (alt-table/reviewed-data
      // reads paginate instead). An explicit offset here is accepted but
      // ignored by design.
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
            rows: masked.rows,
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
          masking,
          limitations: [
            "visual estimate only; chart values require an alt table or reviewed data channel",
            ...(masked.redacted_count > 0
              ? ["sensitive component fields redacted"]
              : []),
          ],
        });
      // offset advances the window: repeated reads with the continuation
      // cursor walk the full collection instead of replaying page one.
      const supplied = masked.rows.slice(offset, offset + maxItems);
      const endPos = offset + supplied.length;
      const hitCap = (input.max_items ?? rows.length) > 200;
      const gap = describeCoverageGap(
        descriptor,
        descriptor.total_count !== undefined
          ? Math.min(endPos, descriptor.total_count)
          : endPos,
      );
      const totalKnown = descriptor.total_count;
      const belowTotal = totalKnown !== undefined && endPos < totalKnown;
      const truncated =
        gap.complete === false || endPos < rows.length || belowTotal || hitCap;
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
                cursor: `offset:${endPos}`,
                reason,
              },
            }
          : {}),
        masking,
        limitations: [
          ...(masked.redacted_count > 0
            ? ["sensitive component fields redacted"]
            : []),
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
        offset,
        supplied_count: supplied.length,
        total_known: totalKnown ?? null,
        truncated,
        reason,
        redacted_count: masked.redacted_count,
        has_continuation: truncated,
      });
      return evidence;
    },
  );
