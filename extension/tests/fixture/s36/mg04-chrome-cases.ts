import { openDatabase } from "../../../../packages/codebase-repository/src/database.js";
import { Mg04Staging } from "../../../../apps/chrome-extension/src/migration/mg04-staging.js";
import { historySource } from "../../unit/migration/s36/mg04-support.js";
function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
export async function runCases() {
  const guard = "f".repeat(64);
  const source = historySource();
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
    let history = new Mg04Staging(db, port);
    const original = JSON.stringify(source);
    const digest = await history.sourceDigest(epoch);
    const checkpoint = await history.stage("chrome-mg04", epoch, digest);
    assert(checkpoint.copied === 1 && checkpoint.quarantined === 0, "COUNTS");
    db.close();
    db = await openDatabase(indexedDB, guard);
    history = new Mg04Staging(db, port);
    assert(await history.validate("chrome-mg04", epoch, checkpoint), "REOPEN");
    assert(
      JSON.stringify(await history.stage("chrome-mg04", epoch, digest)) ===
        JSON.stringify(checkpoint),
      "RETRY",
    );
    assert(JSON.stringify(source) === original, "SOURCE_PRESERVED");
    const thread = (await history.read("chrome-mg04"))?.conversion.records[0];
    assert(
      thread?.historyOnly &&
        !thread.executable &&
        !thread.reconnectAllowed &&
        thread.timeline.every((event) => !("type" in event)),
      "HISTORY_ONLY",
    );
    epoch++;
    let rejected = false;
    try {
      await history.stage("late", 1, digest);
    } catch {
      rejected = true;
    }
    assert(rejected && !(await history.read("late")), "STALE_EPOCH");
    return {
      cases: 6,
      copied: 1,
      quarantined: 0,
      sourcePreserved: true,
      historyOnly: true,
      replayAllowed: false,
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
