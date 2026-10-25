import { BrowserMigrationOwner } from "../../../../apps/chrome-extension/src/migration/owner.js";
import { openDatabase } from "../../../../packages/codebase-repository/src/database.js";
import { migrationTransport } from "../../../../apps/chrome-extension/src/migration/rpc.js";
import { migrationDigest } from "../../../../apps/chrome-extension/src/migration/migration-digest.js";
import { MigrationOwnerAcks } from "../../../../apps/chrome-extension/src/migration/owner-ack.js";
import { migrationJournalSchema } from "../../../../packages/shared/src/migration.js";
import { migrationUnits } from "../../../../packages/shared/src/migration.js";
import type {
  Journal,
  Manifest,
  Unit,
  Checkpoint,
} from "../../../../packages/shared/src/migration-types.js";
import type { FrozenSource } from "../../../../apps/chrome-extension/src/migration/local-staging.js";
import type { MigrationCommand } from "../../../../packages/shared/src/migration-rpc.js";
import { savedSource } from "../../unit/migration/s36/mg03-support.js";
import { historySource } from "../../unit/migration/s36/mg04-support.js";
import {
  diagnosticsSource,
  diagnosticsNow,
} from "../../unit/migration/s36/mg06-support.js";
const check = (value: unknown, code: string) => {
  if (!value) throw new Error(code);
};
export function ownerFixture(
  local: FrozenSource,
  session: FrozenSource,
  writeLocal: (value: Record<string, unknown>) => Promise<void>,
  writeSession: (value: Record<string, unknown>) => Promise<void>,
  request: (value: MigrationCommand) => Promise<unknown>,
) {
  let db: IDBDatabase, profile: string, manifest: Manifest, view: Journal;
  let now = diagnosticsNow;
  const browser = () =>
    new BrowserMigrationOwner(
      db,
      local,
      session,
      migrationTransport(profile, request).port,
      {
        async freeze() {
          await local.assertFrozen(1);
          await session.assertFrozen(1);
        },
        drain: {
          assertFrozen: session.assertFrozen,
          async cancelRequest() {
            throw new Error("UNEXPECTED_ACTIVE_REQUEST");
          },
          async readRequest(row) {
            return row;
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
      },
      () => now,
    );
  return {
    candidate: () => structuredClone(view),
    async restoreLostSources(profileGuard: string, raw: Journal) {
      profile = profileGuard;
      view = migrationJournalSchema.parse(raw) as Journal;
      check(view.manifest.profileGuard === profile, "RESTORE_PROFILE");
      manifest = view.manifest;
      db = await openDatabase(indexedDB, profile);
      const ack = await new MigrationOwnerAcks(db).read("wire");
      check(
        ack?.manifestDigest ===
          migrationDigest({ manifest, stores: view.stores }),
        "PERSISTED_ACK_MISMATCH",
      );
      for (const unit of migrationUnits) {
        const same =
          (await browser().sourceDigest(unit, 1)) ===
          manifest.sourceDigests[unit];
        check(
          same === ["MG01", "MG02", "MG03"].includes(unit),
          "RESTART_SOURCE_STATE",
        );
      }
      let rejected = false;
      try {
        rejected = !(await browser().verifyAcknowledgment(view));
      } catch (error) {
        rejected =
          error instanceof Error && error.message === "MIGRATION_ACK_STAGING";
      }
      check(rejected, "LOST_SOURCE_ACK_ACCEPTED");
      return true;
    },
    async prepare(profileGuard: string) {
      profile = profileGuard;
      await writeLocal(savedSource());
      await writeSession({
        ...historySource(),
        ...diagnosticsSource(),
        execution_requests_v1: [
          {
            request_id: "20000000-0000-4000-8000-000000000001",
            revision: 1,
            state: "TERMINAL",
            stage: "TERMINAL",
            tab_id: 4,
            owner: "old-owner",
            started_at_ms: 0,
            stage_started_at_ms: 0,
            last_progress_at_ms: 0,
            outcome: "VERIFIED",
          },
        ],
      });
      db = await openDatabase(indexedDB, profile);
      const owner = browser();
      check((await owner.freezeAndDrain(1)).ready, "CONTROLLED_DRAIN");
      const sourceDigests = Object.fromEntries(
        await Promise.all(
          migrationUnits.map(async (unit) => [
            unit,
            await owner.sourceDigest(unit, 1),
          ]),
        ),
      ) as Record<Unit, string>;
      manifest = {
        migrationId: "wire",
        profileGuard: profile,
        sourceSchemas: "controlled-source",
        targetSchemas: "controlled-target",
        legacyRelease: "legacy",
        targetRelease: "target",
        sourceDigests,
      };
      return sourceDigests;
    },
    async copy(settings: Checkpoint) {
      view = {
        manifest,
        epoch: 1,
        revision: 1,
        phase: "validated",
        stores: { MG01: settings },
        acknowledgments: {},
      };
      const owner = browser();
      for (const unit of migrationUnits) {
        if (unit === "MG01") continue;
        const cp = await owner.stage(unit, manifest, 1);
        check(cp.sourceDigest === manifest.sourceDigests[unit], "UNIT_SOURCE");
        check(cp.copied > 0, "EMPTY_UNIT");
        view.stores[unit] = cp;
      }
      await owner.acknowledge(view);
      check(await owner.verifyAcknowledgment(view), "BROWSER_ACK");
      return true;
    },
    async reopen() {
      db.close();
      db = await openDatabase(indexedDB, profile);
      check(await browser().verifyAcknowledgment(view), "BROWSER_ACK_REOPEN");
      return true;
    },
    async negatives() {
      const missing = structuredClone(view);
      delete missing.stores.MG06;
      for (const candidate of [
        missing,
        { ...view, manifest: { ...manifest, profileGuard: "d".repeat(64) } },
      ]) {
        let rejected = false;
        try {
          await browser().acknowledge(candidate);
        } catch {
          rejected = true;
        }
        check(rejected, "INVALID_ACK_ACCEPTED");
      }
      now += 31 * 60_000;
      let rejected = false;
      try {
        await browser().verifyAcknowledgment(view);
      } catch {
        rejected = true;
      }
      check(rejected, "EXPIRED_DIAGNOSTICS_ACCEPTED");
      return true;
    },
  };
}
