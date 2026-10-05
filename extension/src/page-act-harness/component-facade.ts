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
// digit-bearing) or machine-shaped (no whitespace): benign `token: expired`
// labels pass through while `token=ab` does not.
const ASSIGNMENT_VALUE = /[:=]\s*(\S+)/;
const SECRET_VALUE = /(\S{8,}|[A-Za-z]*\d\S*|\S*\d[A-Za-z]*)/;
const assignmentLike = (value: string): boolean => {
  const keyed =
    /(password|passwd|secret|api[_-]?key|token|otp|mfa|cookie|bearer|jwt)/i.test(
      value,
    );
  if (!keyed) return false;
  const match = ASSIGNMENT_VALUE.exec(value);
  if (!match) return false;
  const secret = match[1] ?? "";
  return SECRET_VALUE.test(secret) || !/\s/.test(value);
};
const BEARER_TOKEN = /bearer\s*[:\s]+[A-Za-z0-9\-._~+/=]{8,}/gi;
// Generic OAuth-style keys whose values are opaque secrets even without a
// credential keyword in the value itself.
const OPAQUE_SECRET_KEYS =
  /^(code|id_token|access_token|refresh_token|auth|next|state)$/i;
const maskParams = (params: string): { text: string; hit: boolean } => {
  let hit = false;
  const text = params
    .split("&")
    .map((segment) => {
      const eq = segment.indexOf("=");
      const key = eq < 0 ? segment : segment.slice(0, eq);
      const val = eq < 0 ? "" : segment.slice(eq + 1);
      // Percent-encoded keys/values are decoded for INSPECTION (up to three
      // rounds for nested encoding). Output keeps the raw spelling with the
      // value cut. A decode failure, or encoding residue afterwards, means
      // the pair cannot be proven benign, so it is redacted explicitly.
      const decodedKey = decodeQueryPart(key);
      const decodedVal = decodeQueryPart(val);
      // Key-side match (raw or decoded), a credential-looking value, or an
      // opaque secret under a generic key (e.g. OAuth `code=4/0AZ...`).
      if (
        SENSITIVE_KEY.test(key) ||
        decodedKey.sensitive ||
        (decodedKey.ok && SENSITIVE_KEY.test(decodedKey.text)) ||
        (SENSITIVE_KEY.test(val) && SECRET_VALUE.test(val)) ||
        (decodedVal.ok &&
          SENSITIVE_KEY.test(decodedVal.text) &&
          SECRET_VALUE.test(decodedVal.text)) ||
        (OPAQUE_SECRET_KEYS.test(key) && SECRET_VALUE.test(val)) ||
        (OPAQUE_SECRET_KEYS.test(decodedKey.text) &&
          decodedKey.ok &&
          SECRET_VALUE.test(decodedVal.ok ? decodedVal.text : val))
      ) {
        hit = true;
        return `${key}=[REDACTED]`;
      }
      return segment;
    })
    .join("&");
  return { text, hit };
};

// Query-part decoder for inspection only. Never throws: failures and
// leftover encodings report sensitive so callers redact explicitly.
const decodeQueryPart = (
  part: string,
): { text: string; ok: boolean; sensitive: boolean } => {
  let text = part;
  for (let round = 0; round < 3; round += 1) {
    if (!/%[0-9A-Fa-f]{2}/.test(text))
      return { text, ok: true, sensitive: false };
    try {
      // `+` is a space in query strings; decodeURIComponent leaves it.
      text = decodeURIComponent(text.replace(/\+/g, " "));
    } catch {
      return { text: part, ok: false, sensitive: true };
    }
  }
  if (/%[0-9A-Fa-f]{2}/.test(text))
    return { text: part, ok: false, sensitive: true };
  return { text, ok: true, sensitive: false };
};
const URL_WITH_QUERY = /\bhttps?:\/\/[^\s?#]*\?/;
const maskUrlQuery = (value: string): { value: string; hit: boolean } => {
  // Absolute http(s) URLs take the parameter-preserving path. Schemeless
  // strings carrying a query (`/cb?token=...`, `?token=...`) take the same
  // path: only the `?`/`#` structure is trusted, never the scheme.
  const qIndex = value.indexOf("?");
  if (qIndex < 0) return { value, hit: false };
  if (!URL_WITH_QUERY.test(value) && !/[?&][^=\s&]+=[^=\s&]*/.test(value))
    return { value, hit: false };
  // Query AND fragment are masked param-by-param: benign params, path, and
  // fragment structure survive; every secret-bearing pair is redacted.
  const hashIndex = value.indexOf("#", qIndex);
  const query = value.slice(qIndex + 1, hashIndex < 0 ? undefined : hashIndex);
  const fragment = hashIndex < 0 ? null : value.slice(hashIndex + 1);
  const maskedQuery = maskParams(query);
  const maskedFragment =
    fragment === null || fragment === "" ? null : maskParams(fragment);
  if (!maskedQuery.hit && (maskedFragment === null || !maskedFragment.hit))
    return { value, hit: false };
  return {
    value: `${value.slice(0, qIndex + 1)}${maskedQuery.text}${maskedFragment === null ? "" : `#${maskedFragment.text}`}`,
    hit: true,
  };
};

// Fail-closed component masking: sensitive keyed fields are redacted, and
// credential-shaped strings (assignments, bearer tokens, secret-bearing
// URLs) are redacted even without a sensitive key. Counts stay honest so
// `masking.applied: true` is never attached to unexamined data.
export const maskComponentRows = (
  rows: unknown[],
): { rows: unknown[]; categories: string[]; redacted_count: number } => {
  let redacted = 0;
  // Sensitivity propagates: a sensitive key redacts its ENTIRE subtree
  // (string, array, object, scalar) with one count. Arrays/objects never
  // launder a sensitive parent by recursing keylessly.
  const maskValue = (
    value: unknown,
    key?: string,
    inherited = false,
  ): unknown => {
    const sensitive =
      inherited || (key !== undefined && SENSITIVE_KEY.test(key));
    // Opaque-secret keys (OAuth `code`, callback `next`/`state`): the value
    // is a secret by convention when it is secret-shaped, even without a
    // credential keyword anywhere.
    const opaqueSecret =
      !sensitive &&
      typeof value === "string" &&
      key !== undefined &&
      OPAQUE_SECRET_KEYS.test(key) &&
      SECRET_VALUE.test(value);
    if (typeof value === "string") {
      if (sensitive) {
        redacted += 1;
        return "[REDACTED:credential-like]";
      }
      // Bearer tokens first: every occurrence is counted and cut, including
      // ones sharing the string with a URL (the URL pass below returns
      // early and would otherwise leave them).
      const bearerMatches = value.match(BEARER_TOKEN);
      const unbearered =
        bearerMatches !== null
          ? value.replace(BEARER_TOKEN, "Bearer [REDACTED]")
          : value;
      if (bearerMatches !== null) redacted += bearerMatches.length;
      // URLs: only secret-bearing pairs are cut (path/fragment survive).
      // The rules below would redact the whole string.
      const urlMasked = maskUrlQuery(unbearered);
      if (urlMasked.hit) {
        redacted += 1;
        return urlMasked.value;
      }
      if (bearerMatches !== null) return unbearered;
      if (opaqueSecret) {
        redacted += 1;
        return "[REDACTED:credential-like]";
      }
      if (assignmentLike(unbearered)) {
        redacted += 1;
        return "[REDACTED:credential-like]";
      }
      return unbearered;
    }
    if (Array.isArray(value)) {
      if (sensitive) {
        redacted += 1;
        return "[REDACTED:credential-like]";
      }
      return value.map((item) => maskValue(item));
    }
    if (typeof value === "object" && value !== null) {
      if (sensitive) {
        redacted += 1;
        return "[REDACTED:credential-like]";
      }
      const out: Record<string, unknown> = {};
      for (const [entryKey, entryValue] of Object.entries(value))
        out[entryKey] = maskValue(entryValue, entryKey);
      return out;
    }
    if (sensitive) {
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
      // Per-window bound (not a collection bound): callers asking beyond
      // 200 are silently capped and walk continuations; completion still
      // follows remaining rows and EOF.
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
      // NOTE: the visual estimate covers all supplied rows; in-range
      // offsets are accepted but ignored by this channel (alt-table /
      // reviewed-data reads paginate instead). Out-of-range offsets throw
      // above before reaching here.
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
      // The 200-item bound caps each WINDOW, never the collection: completion
      // is decided by remaining rows and EOF, so default and explicit
      // options terminate identically at the last page.
      const supplied = masked.rows.slice(offset, offset + maxItems);
      const endPos = offset + supplied.length;
      const gap = describeCoverageGap(
        descriptor,
        descriptor.total_count !== undefined
          ? Math.min(endPos, descriptor.total_count)
          : endPos,
      );
      const totalKnown = descriptor.total_count;
      const belowTotal = totalKnown !== undefined && endPos < totalKnown;
      const truncated =
        gap.complete === false || endPos < rows.length || belowTotal;
      const reason = belowTotal
        ? "PARTIAL_WINDOW"
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
