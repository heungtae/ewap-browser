import { openDatabase } from "../../../../packages/codebase-repository/src/database.js";
import { Mg05Staging } from "../../../../apps/chrome-extension/src/migration/mg05-staging.js";
import { drainLegacy } from "../../../../apps/chrome-extension/src/migration/mg05-drain.js";
import { activeLegacy } from "../../unit/migration/s36/mg05-support.js";
function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
export async function runCases() {
  const guard = "9".repeat(64);
  const f = await activeLegacy(true);
  f.data.contextpilot_pending_workflow_selections_v1 = {
    schema_version: 1,
    selections: [{ selected_id: "PRIVATE_OLD_SELECTION" }],
  };
  let db = await openDatabase(indexedDB, guard);
  try {
    const before = f.snapshot();
    const drain = await drainLegacy(f.port, before, 1);
    assert(
      f.status()?.state === "TERMINAL" && f.status()?.outcome === "UNKNOWN",
      "REAL_LIFECYCLE_UNKNOWN",
    );
    assert(
      !drain.ready &&
        drain.unknownDispatches === 1 &&
        f.counts().cancellations === 1,
      "BLOCKED_NOT_REPLAYED",
    );
    const source = {
      assertFrozen: f.port.assertFrozen,
      async get(_keys: string[]) {
        return f.snapshot();
      },
    };
    let staging = new Mg05Staging(db, source);
    const original = JSON.stringify(f.snapshot());
    const digest = await staging.sourceDigest(1);
    const checkpoint = await staging.stage("chrome-mg05", 1, digest);
    assert(
      checkpoint.copied === 2 &&
        checkpoint.quarantined === 0 &&
        JSON.stringify(f.snapshot()) === original,
      "STAGING_COUNTS_SOURCE",
    );
    db.close();
    db = await openDatabase(indexedDB, guard);
    staging = new Mg05Staging(db, source);
    assert(
      (await staging.validate("chrome-mg05", 1, checkpoint)) &&
        JSON.stringify(await staging.stage("chrome-mg05", 1, digest)) ===
          JSON.stringify(checkpoint),
      "REOPEN_RETRY",
    );
    const saved = (await staging.read("chrome-mg05"))!;
    assert(
      saved.conversion.records.every(
        (row) => !row.executable && !row.resumable,
      ) && !JSON.stringify(saved.conversion).includes("PRIVATE_OLD_SELECTION"),
      "SELECTION_AUTHORITY_OMITTED",
    );
    f.unfreeze();
    let rejected = false;
    try {
      await staging.stage("late", 1, digest);
    } catch {
      rejected = true;
    }
    assert(rejected && !(await staging.read("late")), "REVOKED_EPOCH");
    return {
      cases: 6,
      copied: 2,
      quarantined: 0,
      ready: drain.ready,
      unknownDispatches: drain.unknownDispatches,
      cancellations: f.counts().cancellations,
      stagingSourcePreserved: true,
      replayAllowed: false,
      actualBrowserDispatches: 0,
      approvals: 0,
    };
  } finally {
    f.cleanup();
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
