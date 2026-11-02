import { expect, it, vi } from "vitest";
import { projectionIpcFixture } from "./projection-ipc-fixture.js";
it("negotiates authenticated reverse projections and validates large Unicode data across bounded native frames", async () => {
  const f = await projectionIpcFixture(1000, 200);
  try {
    const lease = await f.publish(),
      channel = f.hub.connections()[0]!;
    const options = {
      deadline: Date.now() + 10000,
      signal: new AbortController().signal,
      maxBytes: 8 * 1024 * 1024,
    };
    const search = await channel.read(
      lease.id,
      { kind: "search", name: "Save", limit: 10, after: null },
      options,
    );
    expect(search.payload).toMatchObject({
      kind: "search",
      entities: expect.arrayContaining([
        expect.objectContaining({ name: "Save" }),
      ]),
    });
    expect(JSON.stringify(search)).not.toContain("SAMPLE_CANARY");
    const data = await channel.read(
      lease.id,
      { kind: "dataset", id: f.data.id, digest: f.data.digest },
      options,
    );
    expect(data.payload).toEqual({ kind: "dataset", dataset: f.data });
    const query = await channel.read(
      lease.id,
      {
        kind: "query",
        id: f.data.id,
        digest: f.data.digest,
        query: { op: "count", fields: [], filters: [], limit: 1 },
      },
      options,
    );
    expect(query.payload).toMatchObject({
      kind: "query",
      result: { value: 1000, graphRevision: 1, digest: f.data.digest },
    });
    expect(f.stats().chunks).toBeGreaterThan(4);
    expect(f.stats().maxFrame).toBeLessThanOrEqual(256 * 1024);
  } finally {
    await f.dispose();
  }
});
it("keeps legacy peers working without advertising or enabling an unrequested reverse capability", async () => {
  const f = await projectionIpcFixture(3, 0, false);
  try {
    expect(f.hub.connections()).toHaveLength(0);
    await expect(f.bridge.request({ kind: "heartbeat" })).resolves.toEqual({
      kind: "heartbeat",
    });
    await expect(f.publish()).rejects.toThrow("PROJECTION_UNAVAILABLE");
  } finally {
    await f.dispose();
  }
});
it("cancels a stalled projection in both directions and retires the source lease", async () => {
  const f = await projectionIpcFixture();
  try {
    const lease = await f.publish(),
      channel = f.hub.connections()[0]!;
    let release: (() => void) | undefined;
    const original = f.read.catalog.bind(f.read);
    vi.spyOn(f.read, "catalog").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => {
            void original().then(resolve);
          };
        }),
    );
    const stop = new AbortController();
    const pending = channel.read(
      lease.id,
      { kind: "search", name: "", limit: 10, after: null },
      {
        deadline: Date.now() + 10000,
        signal: stop.signal,
        maxBytes: 8 * 1024 * 1024,
      },
    );
    const checked = expect(pending).rejects.toThrow("PROJECTION_CANCELLED");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    stop.abort();
    await checked;
    await vi.waitFor(() => expect(channel.leases()).toHaveLength(0));
    release?.();
    await expect(f.bridge.request({ kind: "heartbeat" })).resolves.toEqual({
      kind: "heartbeat",
    });
  } finally {
    await f.dispose();
  }
});
