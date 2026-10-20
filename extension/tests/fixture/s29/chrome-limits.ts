import { collect } from "../../../../packages/collector/src/index.js";
import { buildGraph } from "../../../../packages/codebase-builder/src/index.js";
import type { Context } from "../../../../packages/codebase-schema/src/index.js";
const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
export async function runLimits(current: Context) {
  const base = {
    batchId: "batch_large",
    context: current,
    expectedRevision: 3,
    scope: "all_dom" as const,
    current: () => true,
  };
  document.body.innerHTML =
    "<main>" +
    Array.from({ length: 6000 }, (_, i) => `<div>${i}</div>`).join("") +
    "</main>";
  const large = await collect(document.body, base);
  assert(large.coverage.examined === 5000, "examined limit");
  assert(large.coverage.status === "partial", "false complete");
  document.body.innerHTML = Array.from(
    { length: 1100 },
    (_, i) => `<button aria-label="Button ${i}"></button>`,
  ).join("");
  const many = await collect(document.body, { ...base, batchId: "batch_emit" });
  assert(
    many.records.length <= 1000 &&
      many.coverage.reasons.includes("OUTPUT_LIMIT") &&
      many.coverage.reasons.includes("BYTE_LIMIT"),
    "emitted/byte limits",
  );
  const capped = await buildGraph(many);
  assert(
    capped.entities.filter((e) => e.kind === "action").length === 256,
    "action limit",
  );
  assert(
    capped.entities.filter((e) => e.kind === "singleton").length === 128,
    "component limit",
  );
  document.body.innerHTML =
    '<table aria-label="Wide">' +
    Array.from(
      { length: 8 },
      () =>
        "<tr>" +
        Array.from(
          { length: 25 },
          () => "<td>" + "X".repeat(250) + "</td>",
        ).join("") +
        "</tr>",
    ).join("") +
    "</table>";
  const wide = await collect(document.body, {
    ...base,
    batchId: "batch_sample",
  });
  const table = wide.records.find((r) => r.kind === "table")!;
  assert(
    table.sample.length === 5 &&
      table.sample.every(
        (r) => r.length === 20 && r.every((c) => c.length === 200),
      ),
    "sample limits",
  );
  const aborted = new AbortController();
  aborted.abort();
  const cancelled = await collect(document.body, {
    ...base,
    batchId: "batch_cancel",
    signal: aborted.signal,
  });
  assert(cancelled.coverage.reasons.includes("CANCELLED"), "cancellation");
  return {
    large: large.coverage,
    emitted: many.coverage,
    generation: capped.generation,
    components: 128,
    actions: 256,
    sample: wide.coverage,
    cancellation: true,
  };
}
