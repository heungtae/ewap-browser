import { expect, it, vi } from "vitest";
import { completed } from "../../../../../packages/codebase-repository/src/database.js";
import { Mg06Staging } from "../../../../../apps/chrome-extension/src/migration/mg06-staging.js";
import {
  storageFixture as fixture,
  storedRows as rows,
} from "./mg06-storage-fixture.js";
it("persists only metadata and fixed retention across close/reopen/retry, leaving raw source with its owner", async () => {
  const f = await fixture();
  const original = structuredClone(f.data);
  try {
    const hash = await f.staging.sourceDigest(1);
    const checkpoint = await f.staging.stage("diagnostics", 1, hash);
    expect(checkpoint).toMatchObject({
      copied: 1,
      quarantined: 0,
      sourceCount: 1,
    });
    const saved = (await f.staging.read("diagnostics"))!;
    expect(JSON.stringify(await rows(f.db))).not.toMatch(
      /CANARY|PRIVATE|message|snapshot|debug_until_ms/,
    );
    f.db.close();
    const db = await f.open();
    try {
      const restarted = new Mg06Staging(db, f.port, f.now);
      f.advance(100);
      expect(await restarted.stage("diagnostics", 1, hash)).toEqual(checkpoint);
      expect(await restarted.validate("diagnostics", 1, checkpoint)).toBe(true);
      expect((await restarted.read("diagnostics"))?.expiresAt).toBe(
        saved.expiresAt,
      );
    } finally {
      db.close();
    }
    expect(f.data).toEqual(original);
  } finally {
    f.db.close();
  }
});
it("rejects source drift and revoked freeze without creating a metadata checkpoint", async () => {
  const f = await fixture();
  try {
    const hash = await f.staging.sourceDigest(1);
    f.data.execution_diagnostics_v1.records[0]!.message = "changed";
    await expect(f.staging.stage("drift", 1, hash)).rejects.toThrow(
      "SOURCE_CHANGED",
    );
    expect(await f.staging.read("drift")).toBeUndefined();
    f.unfreeze();
    await expect(f.staging.stage("revoked", 1, hash)).rejects.toThrow(
      "FENCE_REVOKED",
    );
  } finally {
    f.db.close();
  }
});
it("refuses stored raw-text injection instead of returning it through the metadata reader", async () => {
  const f = await fixture();
  try {
    await f.staging.stage("tamper", 1, await f.staging.sourceDigest(1));
    const saved = (await f.staging.read("tamper"))!;
    Object.assign(saved.conversion.records[0]!, {
      message: "INJECTED_PRIVATE_TEXT",
    });
    const tx = f.db.transaction("migrationJournal", "readwrite");
    const done = completed(tx);
    tx.objectStore("migrationJournal").put(saved);
    await done;
    await expect(f.staging.read("tamper")).rejects.toThrow(
      "MG06_METADATA_INVALID",
    );
  } finally {
    f.db.close();
  }
});
it("quota failure aborts metadata persistence while preserving the source for retry", async () => {
  const f = await fixture();
  try {
    const hash = await f.staging.sourceDigest(1);
    const { IDBObjectStore } = await import("fake-indexeddb");
    const add = vi
      .spyOn(IDBObjectStore.prototype, "add")
      .mockImplementationOnce(() => {
        throw new DOMException("controlled quota", "QuotaExceededError");
      });
    try {
      await expect(f.staging.stage("quota", 1, hash)).rejects.toThrow(
        "controlled quota",
      );
    } finally {
      add.mockRestore();
    }
    expect(await f.staging.read("quota")).toBeUndefined();
    expect(await f.staging.stage("quota", 1, hash)).toMatchObject({
      copied: 1,
      quarantined: 0,
    });
  } finally {
    f.db.close();
  }
});

it("rechecks source stability even when reusing an existing metadata checkpoint", async () => {
  const f = await fixture();
  try {
    const hash = await f.staging.sourceDigest(1);
    await f.staging.stage("retry-drift", 1, hash);
    const get = vi.spyOn(f.port, "get").mockImplementationOnce(async () => {
      const value = structuredClone(f.data);
      f.data.execution_diagnostics_v1.records[0]!.message =
        "changed during retry";
      return value;
    });
    try {
      await expect(f.staging.stage("retry-drift", 1, hash)).rejects.toThrow(
        "SOURCE_CHANGED",
      );
    } finally {
      get.mockRestore();
    }
  } finally {
    f.db.close();
  }
});
