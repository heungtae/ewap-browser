import {
  openDatabase,
  completed,
  request,
} from "../../../../packages/codebase-repository/src/database.js";
import { Mg06Staging } from "../../../../apps/chrome-extension/src/migration/mg06-staging.js";
import { diagnosticsTtl } from "../../../../apps/chrome-extension/src/migration/mg06-convert.js";
import {
  diagnosticsNow,
  diagnosticsSource,
} from "../../unit/migration/s36/mg06-support.js";
function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
export async function runCases() {
  const guard = "5".repeat(64);
  let now = diagnosticsNow;
  let frozen = true;
  const data = diagnosticsSource();
  const original = JSON.stringify(data);
  const source = {
    async get(_keys: string[]) {
      return structuredClone(data);
    },
    async assertFrozen(epoch: number) {
      if (epoch !== 1 || !frozen) throw new Error("FENCE_REVOKED");
    },
  };
  let db = await openDatabase(indexedDB, guard);
  const rows = async () => {
    const tx = db.transaction("migrationJournal", "readonly");
    const done = completed(tx);
    const result = await request(tx.objectStore("migrationJournal").getAll());
    await done;
    return result;
  };
  try {
    let staging = new Mg06Staging(db, source, () => now);
    const digest = await staging.sourceDigest(1);
    const checkpoint = await staging.stage("chrome-mg06", 1, digest);
    assert(
      checkpoint.copied === 1 &&
        checkpoint.quarantined === 0 &&
        /^[a-f0-9]{64}$/.test(checkpoint.sourceDigest),
      "CHECKPOINT",
    );
    assert(
      !/CANARY|PRIVATE|snapshot|message/.test(JSON.stringify(await rows())),
      "RAW_NOT_COPIED",
    );
    db.close();
    db = await openDatabase(indexedDB, guard);
    staging = new Mg06Staging(db, source, () => now);
    now += 100;
    assert(
      (await staging.validate("chrome-mg06", 1, checkpoint)) &&
        JSON.stringify(await staging.stage("chrome-mg06", 1, digest)) ===
          JSON.stringify(checkpoint) &&
        JSON.stringify(data) === original,
      "REOPEN_RETRY_SOURCE",
    );
    now = diagnosticsNow + diagnosticsTtl - 1000;
    assert(
      !(await staging.validate("chrome-mg06", 1, checkpoint)) &&
        JSON.stringify(await rows()) ===
          JSON.stringify([
            { key: JSON.stringify(["MG06", "chrome-mg06"]), expired: true },
          ]),
      "EXPIRY_PURGE",
    );
    let refused = false;
    try {
      await staging.stage("chrome-mg06", 1, digest);
    } catch {
      refused = true;
    }
    assert(refused, "NO_REVIVAL");
    frozen = false;
    let revoked = false;
    try {
      await staging.stage("late", 1, digest);
    } catch {
      revoked = true;
    }
    assert(revoked && !(await staging.read("late")), "REVOKED_EPOCH");
    return {
      cases: 6,
      copied: 1,
      quarantined: 0,
      rawCopied: false,
      expiredMetadataRemoved: true,
      checkpointRevived: false,
      sourcePreserved: true,
      dispatches: 0,
      approvals: 0,
    };
  } finally {
    db.close();
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase(
        `contextpilot-codebase-v1-${guard}`,
      );
      deletion.onsuccess = () => resolve();
      deletion.onerror = () => reject(deletion.error);
    });
  }
}
