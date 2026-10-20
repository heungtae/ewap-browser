import {
  bytes,
  digest,
  canonical,
  type Context,
} from "@contextpilot/codebase-schema";
import {
  advancedBodySchema,
  advancedSchema,
  type AdvancedBody,
  type AdvancedEvidence,
} from "./contracts.js";
export async function evidence(raw: AdvancedBody): Promise<AdvancedEvidence> {
  const body = advancedBodySchema.parse(raw);
  if (bytes(body) > 8 * 1024 * 1024) throw new Error("DATASET_BYTE_LIMIT");
  return advancedSchema.parse({ ...body, digest: await digest(body) });
}
export async function validateEvidence(
  raw: unknown,
  context: Context,
  now: number,
): Promise<AdvancedEvidence> {
  const parsed = advancedSchema.parse(raw);
  const { digest: expected, ...body } = parsed;
  if (
    canonical(parsed.context) !== canonical(context) ||
    now >= parsed.expiresAt ||
    parsed.observedAt > now ||
    bytes(body) > 8 * 1024 * 1024 ||
    (await digest(body)) !== expected
  )
    throw new Error("EVIDENCE_STALE");
  return parsed;
}
export async function boundedEvidence(
  data: AdvancedEvidence,
  limit = 262144,
): Promise<AdvancedEvidence> {
  if (bytes(data) <= limit) return data;
  const { digest: _digest, ...body } = data;
  const projected = (count: number) => ({
    ...body,
    rows: body.rows.slice(0, count),
    rowIds: body.rowIds.slice(0, count),
    coverage: {
      ...body.coverage,
      status: "partial" as const,
      reasons: [...new Set(["BYTE_LIMIT", ...body.coverage.reasons])].slice(
        0,
        24,
      ),
    },
  });
  let low = 0,
    high = body.rows.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (bytes({ ...projected(middle), digest: "0".repeat(64) }) <= limit)
      low = middle;
    else high = middle - 1;
  }
  const result = await evidence(projected(low));
  if (bytes(result) > limit) throw new Error("COLLECTOR_OUTPUT_LIMIT");
  return result;
}
