import { openDatabase } from "../../../../packages/codebase-repository/src/database.js";
import { BrowserMigrationOwner } from "../../../../apps/chrome-extension/src/migration/owner.js";
import { migrationUnits } from "../../../../packages/shared/src/migration.js";
import type {
  Journal,
  Manifest,
  Unit,
} from "../../../../packages/shared/src/migration-types.js";
import {
  policySource,
  memoryMirror,
} from "../../unit/migration/s36/mg02-support.js";
import { savedSource } from "../../unit/migration/s36/mg03-support.js";
import { historySource } from "../../unit/migration/s36/mg04-support.js";
import {
  diagnosticsSource,
  diagnosticsNow,
} from "../../unit/migration/s36/mg06-support.js";
function assert(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}
export async function runCases() {
  const profile = "c".repeat(64);
  let frozen = false,
    now = diagnosticsNow;
  const localData = {
    provider_settings: { schema_version: 2, revision: 4, providers: {} },
    ...policySource(),
    ...savedSource(),
  };
  const sessionData = { ...historySource(), ...diagnosticsSource() };
  const guard = async (epoch: number) => {
    if (!frozen || epoch !== 1) throw new Error("SOURCE_NOT_FROZEN");
  };
  const local = {
    assertFrozen: guard,
    async get() {
      return structuredClone(localData);
    },
  };
  const session = {
    assertFrozen: guard,
    async get() {
      return structuredClone(sessionData);
    },
  };
  const mirror = memoryMirror();
  const lifecycle = {
    async freeze() {
      frozen = true;
    },
    drain: {
      assertFrozen: guard,
      async cancelRequest() {
        throw new Error("UNEXPECTED_REQUEST");
      },
      async readRequest() {
        return undefined;
      },
      async revokeSelections() {
        return 0;
      },
      async remainingActive() {
        return 0;
      },
      async reconcileOwnedCdp() {
        return 0;
      },
    },
  };
  let db = await openDatabase(indexedDB, profile);
  const owner = () =>
    new BrowserMigrationOwner(
      db,
      local,
      session,
      mirror.port,
      lifecycle,
      () => now,
    );
  try {
    let browser = owner();
    assert((await browser.freezeAndDrain(1)).ready, "EMPTY_DRAIN");
    const sourceDigests = Object.fromEntries(
      await Promise.all(
        migrationUnits.map(async (unit) => [
          unit,
          await browser.sourceDigest(unit, 1),
        ]),
      ),
    ) as Record<Unit, string>;
    const manifest: Manifest = {
      migrationId: "chrome-joint",
      profileGuard: profile,
      sourceSchemas: "fixture",
      targetSchemas: "fixture",
      legacyRelease: "legacy",
      targetRelease: "target",
      sourceDigests,
    };
    const view: Journal = {
      manifest,
      epoch: 1,
      revision: 1,
      phase: "validated",
      stores: {},
      acknowledgments: {},
    };
    for (const unit of migrationUnits) {
      if (unit === "MG01") {
        // Browser verifies MG01 source only; real secret/readback target is covered by native SQLite tests.
        view.stores[unit] = {
          sourceDigest: sourceDigests[unit],
          targetDigest: "a".repeat(64),
          copied: 1,
          quarantined: 0,
          sourceCount: 1,
        };
      } else view.stores[unit] = await browser.stage(unit, manifest, 1);
    }
    const original = JSON.stringify(localData);
    const ack = await browser.acknowledge(view);
    assert(
      ack.profileGuard === profile &&
        (await browser.verifyAcknowledgment(view)),
      "ACK_BINDING",
    );
    db.close();
    db = await openDatabase(indexedDB, profile);
    browser = owner();
    assert(await browser.verifyAcknowledgment(view), "ACK_REOPEN");
    assert(
      JSON.stringify(await browser.acknowledge(view)) === JSON.stringify(ack),
      "ACK_IDEMPOTENT",
    );
    let rejected = false;
    try {
      await browser.acknowledge({
        ...view,
        manifest: { ...manifest, profileGuard: "d".repeat(64) },
      });
    } catch {
      rejected = true;
    }
    assert(rejected, "CROSS_PROFILE");
    const checkpoint = view.stores.MG06;
    assert(checkpoint, "MG06_CHECKPOINT");
    delete view.stores.MG06;
    rejected = false;
    try {
      await browser.acknowledge(view);
    } catch {
      rejected = true;
    }
    assert(rejected, "MISSING_UNIT");
    view.stores.MG06 = checkpoint;
    now += 31 * 60_000;
    rejected = false;
    try {
      await browser.verifyAcknowledgment(view);
    } catch {
      rejected = true;
    }
    assert(rejected, "EXPIRY_INVALIDATES_ACK");
    assert(JSON.stringify(localData) === original, "SOURCE_PRESERVED");
    return {
      checks: [
        "five-real-IDB-targets",
        "profile-bound-durable-ack",
        "reopen-and-idempotency",
        "cross-profile-rejected",
        "missing-checkpoint-rejected",
        "expiry-invalidates-ack",
      ],
      providerCalls: 0,
      dispatches: 0,
      scope:
        "controlled browser owner; MG01 target and backend simulated here, native suite covers real backend",
    };
  } finally {
    db.close();
  }
}
