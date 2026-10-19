import {
  argumentBindingSchema,
  type ArgumentBinding,
} from "./binding-schema.js";
import { digest } from "./digest.js";
import { type DecisionContext } from "./schema.js";
import { previousLocalDay, type DateRange } from "./relative-day.js";
export type Scalar = string | number | boolean;
export type ValueRecord = {
  value: Scalar;
  unit: string | null;
  sensitive: boolean;
  authorized: boolean;
  contextDigest: string;
};
export type BindingContext = {
  current: DecisionContext;
  request: string;
  sensitiveSpans: readonly { start: number; end: number }[];
  admittedAt: string;
  timezone?: string;
  approved: ReadonlyMap<string, ValueRecord & { promptRevision: number }>;
  observed: ReadonlyMap<
    string,
    ValueRecord & { graphRevision: number; evidenceRevision: number }
  >;
};
export type BoundArgument =
  | {
      status: "BOUND";
      value: Scalar | DateRange;
      unit: string | null;
      sourceDigest: string;
      binding: ArgumentBinding;
    }
  | { status: "NEED_INPUT"; reason: string };
const need = (reason: string): BoundArgument => ({
  status: "NEED_INPUT",
  reason,
});
export function bindArgument(
  input: unknown,
  context: BindingContext,
): BoundArgument {
  const parsed = argumentBindingSchema.safeParse(input);
  if (!parsed.success) return need("INVALID_PROVENANCE");
  const binding = parsed.data;
  if (binding.kind === "derived_value") {
    const resolved = binding.sources.map((source) =>
      bindArgument(source, context),
    );
    if (resolved.some((value) => value.status !== "BOUND"))
      return need("UNRESOLVED_TRANSFORM_SOURCE");
    const values = resolved.filter(
      (value): value is Extract<BoundArgument, { status: "BOUND" }> =>
        value.status === "BOUND",
    );
    let value: Scalar | DateRange;
    if (binding.transform === "relative-day-v1") {
      if (
        binding.valueType !== "date_range" ||
        binding.unit !== null ||
        values.length !== 1 ||
        !["yesterday", "어제"].includes(
          String(values[0]!.value).toLowerCase(),
        ) ||
        !context.timezone
      )
        return need("AMBIGUOUS_DATE_OR_TIMEZONE");
      try {
        value = previousLocalDay(context.admittedAt, context.timezone);
      } catch {
        return need("AMBIGUOUS_DATE_OR_TIMEZONE");
      }
    } else {
      if (
        binding.valueType !== "number" ||
        values.some(
          (v) =>
            typeof v.value !== "number" ||
            !Number.isSafeInteger(v.value) ||
            v.unit !== binding.unit,
        )
      )
        return need("INVALID_AGGREGATE_UNITS_OR_PRECISION");
      value = values.reduce((sum, v) => sum + Number(v.value), 0);
      if (!Number.isSafeInteger(value))
        return need("INVALID_AGGREGATE_UNITS_OR_PRECISION");
    }
    return {
      status: "BOUND",
      value,
      unit: binding.unit,
      sourceDigest: digest({
        binding,
        sources: values.map((v) => v.sourceDigest),
        value,
      }),
      binding,
    };
  }
  let value: Scalar, unit: string | null;
  if (binding.kind === "user_span") {
    if (
      binding.end > context.request.length ||
      binding.start >= binding.end ||
      context.sensitiveSpans.some(
        (span) => span.start < binding.end && span.end > binding.start,
      )
    )
      return need("SECRET_OR_ABSENT_SPAN");
    value = context.request.slice(binding.start, binding.end);
    unit = null;
    if (digest(value) !== binding.spanDigest)
      return need("SPAN_DIGEST_MISMATCH");
  } else {
    const record =
      binding.kind === "approved_input"
        ? context.approved.get(binding.promptId)
        : context.observed.get(binding.ref);
    if (
      !record ||
      !record.authorized ||
      record.sensitive !== false ||
      record.contextDigest !== digest(context.current)
    )
      return need("STALE_SECRET_OR_UNAUTHORIZED_VALUE");
    if (
      binding.kind === "approved_input" &&
      (!("promptRevision" in record) ||
        record.promptRevision !== binding.promptRevision)
    )
      return need("STALE_PROMPT");
    if (
      binding.kind === "observed_value" &&
      (!("graphRevision" in record) ||
        record.graphRevision !== binding.graphRevision ||
        record.evidenceRevision !== binding.evidenceRevision ||
        binding.graphRevision !== context.current.graphRevision ||
        binding.evidenceRevision !== context.current.evidenceRevision)
    )
      return need("STALE_OBSERVED_VALUE");
    value = record.value;
    unit = record.unit;
  }
  if (
    typeof value !== binding.valueType ||
    unit !== binding.unit ||
    (typeof value === "number" && !Number.isFinite(value)) ||
    (typeof value === "string" && value.length > 4096)
  )
    return need("VALUE_TYPE_OR_UNIT_MISMATCH");
  return {
    status: "BOUND",
    value,
    unit,
    binding,
    sourceDigest: digest({ context: context.current, binding, value }),
  };
}
