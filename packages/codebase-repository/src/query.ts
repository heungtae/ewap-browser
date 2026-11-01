import {
  digest,
  datasetSchema,
  querySchema,
  type Dataset,
} from "@contextpilot/codebase-schema";
export async function queryDataset(input: Dataset, query: unknown) {
  const dataset = datasetSchema.parse(input);
  const { digest: expected, ...body } = dataset;
  if ((await digest(body)) !== expected) throw new Error("DATASET_INTEGRITY");
  const q = querySchema.parse(query);
  const field = (name: string) => {
    const index = dataset.fields.findIndex((f) => f.name === name);
    if (index < 0) throw new Error("UNKNOWN_FIELD");
    return index;
  };
  const filters = q.filters.map((f) => {
    const index = field(f.field);
    if ("range" in f) {
      if (dataset.fields[index]!.type !== "number")
        throw new Error("UNKNOWN_NUMERIC_TYPE");
      if (
        dataset.rows.some(
          (row) => row[index] !== null && typeof row[index] !== "number",
        )
      )
        throw new Error("MIXED_NUMERIC_VALUES");
    }
    return { ...f, index };
  });
  const rows = dataset.rows.filter((row) =>
    filters.every((f) => {
      const value = row[f.index];
      if ("equals" in f) return value === f.equals;
      if (typeof value !== "number") return false;
      const { lower, upper, lowerInclusive, upperInclusive } = f.range;
      return (
        (lower === undefined ||
          (lowerInclusive ? value >= lower : value > lower)) &&
        (upper === undefined ||
          (upperInclusive ? value <= upper : value < upper))
      );
    }),
  );
  const lineage = {
    datasetId: dataset.id,
    partitionId: dataset.partitionId,
    pageKey: dataset.pageKey,
    evidenceIds: dataset.evidenceIds,
    observedAt: dataset.observedAt,
    expiresAt: dataset.expiresAt,
    digest: dataset.digest,
    graphRevision: dataset.graphRevision,
    coverage: dataset.coverage,
    matchedRows: rows.length,
  };
  if (q.op === "count")
    return { ...lineage, value: rows.length, precision: "exact_count" };
  if (q.op === "project") {
    const fields = q.fields.map(field);
    return {
      ...lineage,
      fields: q.fields,
      rows: rows.slice(0, q.limit).map((r) => fields.map((i) => r[i])),
      truncated: rows.length > q.limit,
    };
  }
  if (q.fields.length !== 1) throw new Error("ONE_NUMERIC_FIELD_REQUIRED");
  const index = field(q.fields[0]!);
  if (dataset.fields[index]!.type !== "number")
    throw new Error("UNKNOWN_NUMERIC_TYPE");
  const values = rows.map((r) => r[index]).filter((v) => v !== null);
  if (values.some((v) => typeof v !== "number"))
    throw new Error("MIXED_NUMERIC_VALUES");
  const numbers = values as number[];
  let sum = 0,
    compensation = 0;
  for (const value of numbers) {
    const y = value - compensation;
    const t = sum + y;
    compensation = t - sum - y;
    sum = t;
  }
  const value = !numbers.length
    ? null
    : q.op === "sum"
      ? sum
      : q.op === "average"
        ? sum / numbers.length
        : q.op === "min"
          ? Math.min(...numbers)
          : Math.max(...numbers);
  if (value !== null && !Number.isFinite(value))
    throw new Error("NUMERIC_OVERFLOW");
  return {
    ...lineage,
    value,
    nullsExcluded: rows.length - numbers.length,
    precision: "ieee754_compensated_sum",
    unit: dataset.fields[index]!.unit,
  };
}
