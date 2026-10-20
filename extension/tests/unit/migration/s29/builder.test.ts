import { expect, it } from "vitest";
import {
  buildGraph,
  proposeAnnotation,
  DirtyRoots,
} from "../../../../../packages/codebase-builder/src/index.js";
import {
  deltaSchema,
  digest,
  validateBatch,
  validateDelta,
} from "../../../../../packages/codebase-schema/src/index.js";
import { batch, context, observation } from "./support.js";
it("builds deterministic observed structure without inventing Save persistence or domain schema", async () => {
  const input = await batch([
    observation({
      evidenceId: "ev_form",
      kind: "form",
      role: "form",
      control: null,
      name: "Search",
      stableKey: "b".repeat(64),
    }),
    observation({ parentEvidenceId: "ev_form" }),
  ]);
  const graph = await buildGraph(input);
  expect(await buildGraph(input)).toEqual(graph);
  const action = graph.entities.find((e) => e.kind === "action")!;
  expect(action.capability).toMatchObject({
    businessEffect: "unknown",
    executable: false,
    mode: "act",
  });
  expect(graph.entities.every((e) => e.semanticAnnotation === null)).toBe(true);
  expect(() => proposeAnnotation()).toThrow("JEV_QUALIFICATION_REQUIRED");
});
it("keeps nested grids separate and leaves five-row type inference unknown", async () => {
  const graph = await buildGraph(
    await batch([
      observation({
        evidenceId: "ev_outer",
        kind: "grid",
        control: null,
        name: "Outer",
        headers: ["value"],
        sample: [["1"], ["string"]],
      }),
      observation({
        evidenceId: "ev_inner",
        parentEvidenceId: "ev_outer",
        kind: "grid",
        control: null,
        name: "Inner",
      }),
    ]),
  );
  const outer = graph.entities.find(
    (e) => e.kind === "grid" && e.name === "Outer",
  )!;
  const inner = graph.entities.find(
    (e) => e.kind === "grid" && e.name === "Inner",
  )!;
  expect(inner.parentId).toBe(outer.id);
  expect(
    graph.entities.find((e) => e.kind === "data" && e.name === "Outer")
      ?.fields[0],
  ).toEqual({ name: "value", type: "unknown", required: null, unit: null });
});
it("reuses uniquely matching structure, separates duplicate names, tombstones removed actions", async () => {
  const first = await buildGraph(await batch());
  const revisit = await buildGraph(
    await batch(undefined, 2, 1),
    first.entities,
  );
  expect(revisit.entities.find((e) => e.kind === "control")?.id).toBe(
    first.entities.find((e) => e.kind === "control")?.id,
  );
  const duplicate = await buildGraph(
    await batch([observation(), observation({ evidenceId: "ev_two" })], 3, 2),
    revisit.entities,
  );
  const controls = duplicate.entities.filter((e) => e.kind === "control");
  expect(new Set(controls.map((e) => e.id)).size).toBe(2);
  expect(
    controls.every(
      (e) => e.id !== revisit.entities.find((e) => e.kind === "control")!.id,
    ),
  ).toBe(true);
  const removed = await buildGraph(await batch([], 4, 3), duplicate.entities);
  expect(removed.tombstones.length).toBeGreaterThan(0);
});
it("partitions account/query/profile and unknown account contexts without route stripping", async () => {
  const a = await context();
  const other = await context(1, "https://fixture.test/search?q=two");
  expect(a.pageKey).not.toBe(other.pageKey);
  expect((await context(1, undefined, "other")).partitionId).not.toBe(
    a.partitionId,
  );
  expect((await context(1, undefined, null)).partitionId).not.toBe(
    a.partitionId,
  );
});
it("rejects authority fields, cross-partition references, false verification and altered digest", async () => {
  const graph = await buildGraph(await batch());
  expect(() => deltaSchema.parse({ ...graph, grant: "secret" })).toThrow();
  const entity = { ...graph.entities[0]!, ref: "live-dom-ref" };
  expect(() => deltaSchema.parse({ ...graph, entities: [entity] })).toThrow();
  const cross = {
    ...graph,
    entities: graph.entities.map((e, i) =>
      i === 0 ? { ...e, partitionId: "partition_other" } : e,
    ),
  };
  const { digest: _hash, ...body } = cross;
  await expect(
    validateDelta({ ...body, digest: await digest(body) }),
  ).rejects.toThrow("CROSS_PARTITION");
  expect(() =>
    deltaSchema.parse({
      ...graph,
      evidence: graph.evidence.map((e) => ({
        ...e,
        status: "verified",
        predicate: null,
      })),
    }),
  ).toThrow();
  const input = await batch();
  await expect(
    validateBatch({ ...input, digest: "0".repeat(64) }),
  ).rejects.toThrow("BATCH_INTEGRITY");
});
it("limits mutation storms and does not refresh debounce deadline forever", () => {
  const dirty = new DirtyRoots(10, "root");
  dirty.mark("one", 0);
  expect(dirty.flush(249).kind).toBe("wait");
  expect(dirty.flush(250).kind).toBe("partial");
  for (let i = 0; i < 3; i++) {
    dirty.mark("root", 1000 + i * 1000);
    expect(dirty.flush(1250 + i * 1000).kind).toBe(
      i === 2 ? "unstable" : "full",
    );
  }
});
