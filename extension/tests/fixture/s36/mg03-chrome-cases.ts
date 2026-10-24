import { openDatabase } from "../../../../packages/codebase-repository/src/database.js";
import { Mg03Staging } from "../../../../apps/chrome-extension/src/migration/mg03-staging.js";
import { savedSource } from "../../unit/migration/s36/mg03-support.js";
function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
export async function runCases() {
  const guard = "e".repeat(64);
  const source: Record<string, unknown> = savedSource();
  let epoch = 1;
  const port = {
    async get(_keys: string[]) {
      return structuredClone(source);
    },
    async assertFrozen(expected: number) {
      if (expected !== epoch) throw new Error("EPOCH_REVOKED");
    },
  };
  let db = await openDatabase(indexedDB, guard);
  try {
    let staging = new Mg03Staging(db, port);
    const original = JSON.stringify(source);
    const digest = await staging.sourceDigest(epoch);
    const checkpoint = await staging.stage("chrome-mg03", epoch, digest);
    assert(checkpoint.copied === 1 && checkpoint.quarantined === 0, "COUNTS");
    db.close();
    db = await openDatabase(indexedDB, guard);
    staging = new Mg03Staging(db, port);
    assert(
      await staging.validate("chrome-mg03", epoch, checkpoint),
      "REOPEN_VALIDATION",
    );
    const retry = await staging.stage("chrome-mg03", epoch, digest);
    assert(JSON.stringify(retry) === JSON.stringify(checkpoint), "RETRY");
    assert(JSON.stringify(source) === original, "SOURCE_CHANGED");
    assert(
      (await staging.read("chrome-mg03"))?.conversion.records[0]?.executable ===
        false,
      "AUTHORITY",
    );
    epoch++;
    let rejected = false;
    try {
      await staging.stage("late", 1, digest);
    } catch {
      rejected = true;
    }
    assert(rejected && !(await staging.read("late")), "STALE_EPOCH");
    return {
      cases: 6,
      copied: 1,
      quarantined: 0,
      sourcePreserved: true,
      authorityImported: false,
      dispatches: 0,
      approvals: 0,
    };
  } finally {
    db.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(
        `contextpilot-codebase-v1-${guard}`,
      );
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}
