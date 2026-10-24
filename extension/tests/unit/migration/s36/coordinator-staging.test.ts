import { expect, it } from "vitest";
import { openDatabase } from "../../../../../packages/codebase-repository/src/database.js";
import { Mg03Staging } from "../../../../../apps/chrome-extension/src/migration/mg03-staging.js";
import { Mg04Staging } from "../../../../../apps/chrome-extension/src/migration/mg04-staging.js";
import { Mg05Staging } from "../../../../../apps/chrome-extension/src/migration/mg05-staging.js";
import { legacyStagingForCoordinator } from "../../../../../apps/chrome-extension/src/migration/coordinator-staging.js";
import {
  hexDigest,
  browserDigest,
} from "../../../../../apps/chrome-extension/src/migration/migration-digest.js";
import { savedSource } from "./mg03-support.js";
import { historySource } from "./mg04-support.js";
import { archivedRequest } from "./mg05-support.js";
it.each(["MG03", "MG04", "MG05"])(
  "adapts real %s checkpoints to coordinator hex without rewriting existing stored digests",
  async (unit) => {
    const factory = new (await import("fake-indexeddb")).IDBFactory();
    const db = await openDatabase(factory, "7".repeat(64));
    const data = {
      ...savedSource(),
      ...historySource(),
      execution_requests_v1: [archivedRequest({ outcome: "UNKNOWN" })],
    };
    const port = {
      async assertFrozen(epoch: number) {
        if (epoch !== 1) throw new Error("EPOCH");
      },
      async get() {
        return data;
      },
    };
    const legacy =
      unit === "MG03"
        ? new Mg03Staging(db, port)
        : unit === "MG04"
          ? new Mg04Staging(db, port)
          : new Mg05Staging(db, port);
    try {
      const bridge = legacyStagingForCoordinator(legacy);
      const digest = await bridge.sourceDigest(1);
      expect(digest).toMatch(/^[a-f0-9]{64}$/);
      const checkpoint = await bridge.stage("encoding", 1, digest);
      expect(checkpoint.targetDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(await bridge.validate("encoding", 1, checkpoint)).toBe(true);
      const original = (await legacy.read("encoding"))!.checkpoint;
      expect(original.sourceDigest).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(browserDigest(checkpoint.sourceDigest)).toBe(
        original.sourceDigest,
      );
      expect(checkpoint.copied).toBe(original.copied);
      expect(
        await bridge.validate("encoding", 1, {
          ...checkpoint,
          targetDigest: "b".repeat(64),
        }),
      ).toBe(false);
    } finally {
      db.close();
    }
  },
);
it("rejects wrong or noncanonical digest encodings instead of guessing a protocol", () => {
  expect(() => hexDigest("a".repeat(64))).toThrow("MIGRATION_DIGEST_ENCODING");
  expect(() => hexDigest("A".repeat(42) + "B")).toThrow(
    "MIGRATION_DIGEST_ENCODING",
  );
  expect(() => browserDigest("A".repeat(64))).toThrow(
    "MIGRATION_DIGEST_ENCODING",
  );
});
