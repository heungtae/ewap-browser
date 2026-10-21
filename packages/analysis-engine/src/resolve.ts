import { queryDataset } from "@contextpilot/codebase-repository";
import {
  bytes,
  datasetSchema,
  digest,
  type Dataset,
} from "@contextpilot/codebase-schema";
import {
  requestSchema,
  type AnalysisInput,
  type AnalysisRequest,
  type Projection,
} from "./contracts.js";
import { safeLabel, sanitize } from "./privacy.js";
export interface DataPort {
  read(
    ref: AnalysisRequest["datasets"][number],
    partitionId: string,
  ): Promise<unknown>;
  // Must validate exact task, dataset, fields, digest, config/endpoint and current consent.
  authorized(request: AnalysisRequest, dataset: Dataset): Promise<boolean>;
}
export async function resolveInput(
  raw: AnalysisRequest,
  port: DataPort,
  now: () => number,
  signal?: AbortSignal,
): Promise<AnalysisInput> {
  const request = requestSchema.parse(raw);
  const active = () => {
    if (signal?.aborted) throw new Error("ANALYSIS_CANCELLED");
    if (now() >= request.deadline) throw new Error("ANALYSIS_EXPIRED");
  };
  active();
  const datasets: Projection[] = [];
  let earliestExpiry = Infinity;
  if (
    new Set(request.datasets.map((r) => r.id)).size !== request.datasets.length
  )
    throw new Error("ANALYSIS_DUPLICATE_DATASET");
  for (const ref of request.datasets) {
    const data = datasetSchema.parse(await port.read(ref, request.partitionId));
    active();
    const { digest: expected, ...body } = data;
    if (
      (await digest(body)) !== expected ||
      data.digest !== ref.digest ||
      data.id !== ref.id ||
      data.partitionId !== request.partitionId ||
      data.pageKey !== ref.pageKey ||
      data.graphRevision !== ref.graphRevision ||
      data.observedAt > now() ||
      data.expiresAt <= now()
    )
      throw new Error("ANALYSIS_DATASET_BINDING");
    earliestExpiry = Math.min(earliestExpiry, data.expiresAt);
    if (!(await port.authorized(request, data)))
      throw new Error("ANALYSIS_DISCLOSURE_DENIED");
    const indices = ref.fields.map((name) => {
      safeLabel(name);
      const index = data.fields.findIndex((f) => f.name === name);
      if (index < 0) throw new Error("ANALYSIS_UNKNOWN_FIELD");
      return index;
    });
    if (new Set(indices).size !== indices.length)
      throw new Error("ANALYSIS_DUPLICATE_FIELD");
    let redacted = data.coverage.redactions > 0;
    const rows = data.rows.map((r) =>
      indices.map((i) => {
        const v = r[i]!;
        const masked = typeof v === "string" ? sanitize(v) : v;
        if (masked !== v) redacted = true;
        return masked;
      }),
    );
    if (bytes(rows) > request.maxBytes)
      throw new Error("ANALYSIS_EGRESS_LIMIT");
    const aggregates: Projection["aggregates"] = [
      { op: "count", field: null, value: data.rows.length },
    ];
    for (const i of indices.filter((i) => data.fields[i]!.type === "number")) {
      for (const op of ["sum", "min", "max", "average"] as const) {
        active();
        const result = await queryDataset(data, {
          op,
          fields: [data.fields[i]!.name],
          filters: [],
          limit: 1000,
        });
        active();
        if (!("value" in result)) throw new Error("ANALYSIS_QUERY_INVALID");
        aggregates.push({
          op,
          field: data.fields[i]!.name,
          value: result.value,
        });
      }
    }
    const projection = {
      id: data.id,
      digest: data.digest,
      fields: indices.map((i) => ({
        ...data.fields[i]!,
        unit:
          data.fields[i]!.unit === null
            ? null
            : safeLabel(data.fields[i]!.unit!),
      })),
      rows,
      aggregates,
      rowIds: data.rowIds,
      evidenceIds: data.evidenceIds,
      partial: data.coverage.status !== "complete",
      redacted,
    };
    datasets.push({
      ...projection,
      projectionDigest: await digest(projection),
    });
    if (bytes(datasets) > request.maxBytes)
      throw new Error("ANALYSIS_EGRESS_LIMIT");
  }
  active();
  if (now() >= earliestExpiry) throw new Error("ANALYSIS_DATASET_BINDING");
  const body = {
    schema: request.schema,
    taskId: request.taskId,
    attemptId: request.attemptId,
    objective: sanitize(request.objective),
    criteria: request.criteria.map(sanitize),
    configDigest: request.configDigest,
    datasets,
  };
  if (bytes(body) > request.maxBytes) throw new Error("ANALYSIS_EGRESS_LIMIT");
  const inputDigest = await digest(body);
  active();
  if (now() >= earliestExpiry) throw new Error("ANALYSIS_DATASET_BINDING");
  return { ...body, inputDigest };
}
