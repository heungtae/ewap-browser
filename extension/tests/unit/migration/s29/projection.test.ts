import { expect, it, vi } from "vitest";
import {
  projectionPacketSchema,
  canonical,
  digest,
} from "../../../../../packages/codebase-schema/src/index.js";
import { projectionFixture } from "./projection-fixture.js";
it("projects requested metadata without sample/observation data, with revision-bound pagination", async () => {
  const f = await projectionFixture();
  try {
    const first = await f.registry.project(
      f.request({ kind: "search", name: "", limit: 1, after: null }),
    );
    expect(first.payload.kind).toBe("search");
    if (first.payload.kind !== "search") throw Error("SEARCH_EXPECTED");
    expect(first.payload.entities).toHaveLength(1);
    expect(first.payload.cursor).not.toBeNull();
    expect(JSON.stringify(first)).not.toContain("SAMPLE_CANARY");
    expect(JSON.stringify(first.payload)).not.toContain('"observation"');
    const firstEntityId = first.payload.entities[0]!.id;
    const next = await f.registry.project(
      f.request({
        kind: "search",
        name: "",
        limit: 128,
        after: first.payload.cursor,
      }),
    );
    if (next.payload.kind !== "search") throw Error("SEARCH_EXPECTED");
    expect(next.payload.cursor).toBeNull();
    expect(next.payload.entities.some((e) => e.id === firstEntityId)).toBe(
      false,
    );
    const { digest: expected, ...body } = first;
    expect(await digest(body)).toBe(expected);
    expect(projectionPacketSchema.parse(first)).toEqual(first);
  } finally {
    f.close();
  }
});
it("requires separate sample/dataset permission and returns authorized immutable data/query lineage", async () => {
  const f = await projectionFixture();
  try {
    const entity = f.graph.entities.find((e) => e.sample.length > 0)!;
    const locked = await f.registry.install(f.read, {
      ...f.admission,
      permissions: { graph: true, samples: false, datasets: [] },
    });
    const spy = vi.spyOn(f.read, "dataset");
    await expect(
      f.registry.project(
        f.request(
          { kind: "dataset", id: f.data.id, digest: f.data.digest },
          locked,
        ),
      ),
    ).rejects.toThrow("PROJECTION_DENIED");
    expect(spy).not.toHaveBeenCalled();
    await expect(
      f.registry.project(
        f.request(
          { kind: "inspect", id: entity.id, includeSample: true },
          locked,
        ),
      ),
    ).rejects.toThrow("PROJECTION_DENIED");
    const inspected = await f.registry.project(
      f.request({ kind: "inspect", id: entity.id, includeSample: true }),
    );
    expect(JSON.stringify(inspected)).toContain("SAMPLE_CANARY");
    const data = await f.registry.project(
      f.request({ kind: "dataset", id: f.data.id, digest: f.data.digest }),
    );
    expect(data.payload).toEqual({ kind: "dataset", dataset: f.data });
    const result = await f.registry.project(
      f.request({
        kind: "query",
        id: f.data.id,
        digest: f.data.digest,
        query: { op: "average", fields: ["value"], filters: [], limit: 1 },
      }),
    );
    expect(result.payload).toMatchObject({
      kind: "query",
      result: {
        value: 1.5,
        digest: f.data.digest,
        nullsExcluded: 1,
        graphRevision: 1,
      },
    });
  } finally {
    f.close();
  }
});
it("rejects changed source, graph, scope, byte budget and revoked leases without reusing cached projections", async () => {
  const f = await projectionFixture();
  try {
    const operation = {
      kind: "search" as const,
      name: "Save",
      limit: 10,
      after: null,
    };
    const wrong = f.request(operation);
    wrong.scope = { ...wrong.scope, taskId: "task_foreign" };
    await expect(f.registry.project(wrong)).rejects.toThrow("PROJECTION_STALE");
    await expect(
      f.registry.project({ ...f.request(operation), maxBytes: 1 }),
    ).rejects.toThrow("PROJECTION_LIMIT");
    const before = await f.registry.project(f.request(operation));
    expect(canonical(before)).toContain("Save");
    f.revoke();
    await expect(f.registry.project(f.request(operation))).rejects.toThrow(
      "PROJECTION_STALE",
    );
    await expect(f.registry.project(f.request(operation))).rejects.toThrow(
      "PROJECTION_DENIED",
    );
  } finally {
    f.close();
  }
});
