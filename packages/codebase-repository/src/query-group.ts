import type { Dataset } from "@contextpilot/codebase-schema";

type GroupAggregate = { op: "sum" | "min" | "max" | "average"; field: string };
type Cell = Dataset["rows"][number][number];
type Group = { key: Cell; count: number; values: number[] };

export function groupRows(
  dataset: Dataset,
  rows: Dataset["rows"],
  field: string,
  limit: number,
  aggregate?: GroupAggregate,
) {
  const index = dataset.fields.findIndex((item) => item.name === field);
  if (index < 0) throw new Error("UNKNOWN_FIELD");
  const type = dataset.fields[index]!.type;
  if (type !== "number" && type !== "string" && type !== "boolean")
    throw new Error("GROUP_TYPE_UNAVAILABLE");
  if (
    dataset.rows.some(
      (row) => row[index] !== null && typeof row[index] !== type,
    )
  )
    throw new Error("GROUP_TYPE_MISMATCH");
  const aggregateIndex = aggregate
    ? dataset.fields.findIndex((item) => item.name === aggregate.field)
    : -1;
  if (aggregate && aggregateIndex < 0) throw new Error("UNKNOWN_FIELD");
  if (aggregate && dataset.fields[aggregateIndex]!.type !== "number")
    throw new Error("UNKNOWN_NUMERIC_TYPE");
  if (
    aggregate &&
    dataset.rows.some(
      (row) =>
        row[aggregateIndex] !== null && typeof row[aggregateIndex] !== "number",
    )
  )
    throw new Error("MIXED_NUMERIC_VALUES");
  const groups = new Map<Cell, Group>();
  for (const row of rows) {
    const key = row[index];
    if (key === undefined) throw new Error("DATASET_SHAPE");
    let group = groups.get(key);
    if (!group) {
      group = { key, count: 0, values: [] };
      groups.set(key, group);
    }
    group.count++;
    if (aggregate && typeof row[aggregateIndex] === "number")
      group.values.push(row[aggregateIndex] as number);
  }
  const result = [...groups.values()].slice(0, limit).map((group) => {
    if (!aggregate) return { key: group.key, count: group.count };
    let value: number | null = null;
    if (group.values.length) {
      if (aggregate.op === "min") value = Math.min(...group.values);
      else if (aggregate.op === "max") value = Math.max(...group.values);
      else {
        let sum = 0,
          compensation = 0;
        for (const number of group.values) {
          const y = number - compensation,
            next = sum + y;
          compensation = next - sum - y;
          sum = next;
        }
        value = aggregate.op === "average" ? sum / group.values.length : sum;
      }
      if (!Number.isFinite(value)) throw new Error("NUMERIC_OVERFLOW");
    }
    return {
      key: group.key,
      count: group.count,
      value,
      nullsExcluded: group.count - group.values.length,
    };
  });
  return {
    field,
    groups: result,
    totalGroups: groups.size,
    truncated: groups.size > limit,
    ...(aggregate
      ? {
          aggregate,
          unit: dataset.fields[aggregateIndex]!.unit,
          precision:
            aggregate.op === "min" || aggregate.op === "max"
              ? "ieee754_comparison"
              : "ieee754_compensated_sum",
        }
      : { precision: "exact_count" }),
  };
}
