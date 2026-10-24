import { expect, it } from "vitest";
import { openDatabase } from "../../../../../packages/codebase-repository/src/database.js";
import { Mg05Staging } from "../../../../../apps/chrome-extension/src/migration/mg05-staging.js";
import { archivedRequest } from "./mg05-support.js";
it("preserves original execution/selection snapshots and reopens as inspection-only archives", async () => {
  const factory = new (await import("fake-indexeddb")).IDBFactory();
  const open = () => openDatabase(factory, "d".repeat(64));
  let db = await open();
  const data = {
    execution_requests_v1: [
      archivedRequest({ outcome: "UNKNOWN", dispatch_started: true }),
    ],
    contextpilot_pending_workflow_selections_v1: {
      schema_version: 1,
      selections: [{ selected_id: "OLD_SELECTION_SECRET" }],
    },
    other_key: "NEVER_COPY",
  };
  const original = structuredClone(data);
  const port = {
    async assertFrozen(epoch: number) {
      if (epoch !== 1) throw new Error("STALE");
    },
    async get(keys: string[]) {
      expect(keys).toEqual([
        "execution_requests_v1",
        "contextpilot_pending_workflow_selections_v1",
      ]);
      return data;
    },
  };
  try {
    let staging = new Mg05Staging(db, port);
    const hash = await staging.sourceDigest(1);
    const checkpoint = await staging.stage("execution-archive", 1, hash);
    expect(checkpoint).toMatchObject({
      sourceCount: 2,
      copied: 2,
      quarantined: 0,
    });
    db.close();
    db = await open();
    staging = new Mg05Staging(db, port);
    expect(await staging.validate("execution-archive", 1, checkpoint)).toBe(
      true,
    );
    expect(await staging.stage("execution-archive", 1, hash)).toEqual(
      checkpoint,
    );
    const stored = (await staging.read("execution-archive"))!;
    expect(JSON.stringify(stored.snapshot)).toContain("OLD_SELECTION_SECRET");
    expect(JSON.stringify(stored)).not.toContain("NEVER_COPY");
    expect(JSON.stringify(stored.conversion)).not.toContain(
      "OLD_SELECTION_SECRET",
    );
    expect(
      stored.conversion.records.every(
        (row) => !row.executable && !row.resumable,
      ),
    ).toBe(true);
    expect(data).toEqual(original);
  } finally {
    db.close();
  }
});
