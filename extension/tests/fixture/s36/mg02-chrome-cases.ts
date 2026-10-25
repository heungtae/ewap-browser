import { openDatabase } from "../../../../packages/codebase-repository/src/database.js";
import { Mg02Staging } from "../../../../apps/chrome-extension/src/migration/mg02-staging.js";
import { evaluateMigratedPolicy } from "../../../../packages/policy-engine/src/migration-evaluate.js";
import { setup } from "../s30/setup.js";
import {
  policySource,
  memoryMirror,
} from "../../unit/migration/s36/mg02-support.js";
function assert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(code);
}
export async function runCases() {
  const profile = "4".repeat(64);
  let frozen = true;
  const data = policySource();
  data.agent_preferences.approval_policy.mode = "full";
  const original = JSON.stringify(data);
  const source = {
    async get(_keys: string[]) {
      return structuredClone(data);
    },
    async assertFrozen(epoch: number) {
      if (epoch !== 1 || !frozen) throw new Error("FENCE_REVOKED");
    },
  };
  const backend = memoryMirror();
  let db = await openDatabase(indexedDB, profile);
  try {
    let migration = new Mg02Staging(db, source);
    const digest = await migration.sourceDigest(1);
    const checkpoint = await migration.stage("chrome-mg02", 1, digest);
    assert(
      checkpoint.copied === 3 &&
        checkpoint.quarantined === 0 &&
        /^[a-f0-9]{64}$/.test(checkpoint.sourceDigest),
      "COUNTS",
    );
    await migration.mirror("chrome-mg02", 1, profile, backend.port);
    assert(
      await migration.validateMirror("chrome-mg02", 1, profile, backend.port),
      "BOTH_ACKS",
    );
    const policy = [...backend.values.values()][0]!.conversion;
    const runtime = await setup();
    const input = {
      tool: "web.fill" as const,
      effect: runtime.effect,
      context: runtime.context,
      url: "https://example.test/",
      freshSiteConsent: true,
      planApproved: true,
      readScope: "all_dom" as const,
      visionRequested: false,
      manualVisionRequest: false,
    };
    assert(evaluateMigratedPolicy(policy, input) === "deny", "DENY_PRESERVED");
    assert(
      evaluateMigratedPolicy(policy, { ...input, tool: "web.click" }) ===
        "explicit",
      "FULL_ALLOW_NOT_REPLAYED",
    );
    db.close();
    db = await openDatabase(indexedDB, profile);
    migration = new Mg02Staging(db, source);
    assert(
      (await migration.validateMirror(
        "chrome-mg02",
        1,
        profile,
        backend.port,
      )) &&
        JSON.stringify(await migration.stage("chrome-mg02", 1, digest)) ===
          JSON.stringify(checkpoint) &&
        JSON.stringify(data) === original,
      "REOPEN_SOURCE",
    );
    frozen = false;
    let rejected = false;
    try {
      await migration.mirror("chrome-mg02", 1, profile, backend.port);
    } catch {
      rejected = true;
    }
    assert(rejected, "REVOKED_EPOCH");
    return {
      cases: 6,
      copied: 3,
      quarantined: 0,
      mirrored: true,
      storedAllowDecision: "explicit",
      storedDenyDecision: "deny",
      sourcePreserved: true,
      dispatches: 0,
      approvals: 0,
    };
  } finally {
    db.close();
    await new Promise<void>((resolve, reject) => {
      const deletion = indexedDB.deleteDatabase(
        `contextpilot-codebase-v1-${profile}`,
      );
      deletion.onsuccess = () => resolve();
      deletion.onerror = () => reject(deletion.error);
    });
  }
}
