import { traceDecision, traceMethod } from "../diagnostics/method-trace.js";
import { isOpaqueId } from "./contracts.js";

export type ObservedKind =
  | "table"
  | "grid"
  | "list"
  | "tree"
  | "chart"
  | "svg"
  | "canvas"
  | "image"
  | "unclassified";

export type ReadChannel =
  | "visible_rows"
  | "bounded_scroll"
  | "subtree"
  | "continuation"
  | "alt_table"
  | "description"
  | "visual"
  | "reviewed_data";

export type ComponentDescriptorInput = {
  resource_id: string;
  binding_revision: string;
  observed_hint: ObservedKind;
  hint_basis: string;
  visible_count: number;
  logical_count?: number;
  total_count?: number;
  has_eof: boolean;
  channels: Array<{
    channel: ReadChannel;
    available: boolean;
    reason?: string;
  }>;
  continuation?: { cursor: string; reason: string };
  restoration?: string;
  side_effect?: string;
};

export type ComponentDescriptor = ComponentDescriptorInput & {
  // The kind guess is a non-authoritative observation: it never fixes the
  // read strategy and never grants execution permission (design §7).
  observed_hint_note: "OBSERVED_HINT_ONLY";
};

export const buildComponentDescriptor = (
  input: ComponentDescriptorInput,
): ComponentDescriptor =>
  traceMethod(
    "page-act-harness/component-descriptor.ts:buildComponentDescriptor",
    { observed_hint: input.observed_hint },
    () => {
      if (!isOpaqueId(input.resource_id))
        throw new Error("RESOURCE_ID_INVALID");
      if (!isOpaqueId(input.binding_revision))
        throw new Error("BINDING_INVALID");
      if (!input.hint_basis || input.hint_basis.trim().length === 0)
        throw new Error("HINT_BASIS_REQUIRED");
      for (const count of [
        input.visible_count,
        input.logical_count,
        input.total_count,
      ]) {
        if (count === undefined) continue;
        if (!Number.isInteger(count) || count < 0)
          throw new Error("INVALID_COUNT");
      }
      if (
        input.logical_count !== undefined &&
        input.visible_count > input.logical_count
      )
        throw new Error("VISIBLE_ABOVE_LOGICAL");
      if (
        input.total_count !== undefined &&
        input.logical_count !== undefined &&
        input.total_count < input.logical_count
      )
        throw new Error("TOTAL_BELOW_LOGICAL");
      // Unknown totals stay omitted (never zero): callers must not invent
      // total_count when the source did not report one.
      const descriptor: ComponentDescriptor = {
        ...input,
        observed_hint_note: "OBSERVED_HINT_ONLY",
      };
      traceDecision("page-act-harness.component.described", {
        observed_hint: input.observed_hint,
        visible_count: input.visible_count,
        total_known: input.total_count ?? null,
        has_eof: input.has_eof,
      });
      return descriptor;
    },
  );

export const describeCoverageGap = (
  descriptor: ComponentDescriptor,
  supplied?: number,
): { complete: boolean; reason: string } => {
  if (!descriptor.has_eof)
    return { complete: false, reason: "EOF_NOT_OBSERVED" };
  if (descriptor.total_count === undefined)
    return { complete: false, reason: "TOTAL_UNKNOWN" };
  // A descriptor-level EOF is necessary but not sufficient: the caller must
  // also show the supplied window covers the known total.
  if (supplied !== undefined && supplied < descriptor.total_count)
    return { complete: false, reason: "PARTIAL_WINDOW" };
  return { complete: true, reason: "EOF_OBSERVED" };
};
