import { migrationJournalSchema } from "../../../../packages/shared/src/migration.js";
import {
  migrationConsensusResultSchema,
  type MigrationCommand,
} from "../../../../packages/shared/src/migration-rpc.js";
import type { Journal } from "../../../../packages/shared/src/migration-types.js";
import type { BrowserMigrationPort } from "../../../../packages/shared/src/migration-ports.js";
import { parseMigrationCommand } from "../../../../packages/policy-engine/src/migration-rpc.js";
import type { FrozenSource } from "./local-staging.js";
import { migrationDigest } from "./migration-digest.js";
import { checkpointTransport } from "./checkpoints-rpc.js";
import { settingsTransport } from "./settings-rpc.js";
export function consensusTransport(
  profileGuard: string,
  request: (command: MigrationCommand) => Promise<unknown>,
  browser: BrowserMigrationPort,
  source: FrozenSource,
  mode: "session-only" | "os-store",
) {
  const settings = settingsTransport(profileGuard, source, request);
  const checkpoints = checkpointTransport(
    profileGuard,
    request,
    browser,
    async (id, epoch, cp) => {
      await settings.validate(id, epoch, cp, mode);
      return true;
    },
  );
  const verify = async (view: Journal) => {
    await checkpoints.validateStores(
      view.manifest,
      {
        migrationId: view.manifest.migrationId,
        epoch: view.epoch,
        revision: view.revision,
      },
      view.stores,
    );
  };
  const capture = async (view: Journal) => {
    await source.assertFrozen(view.epoch);
    const raw = (await source.get(["provider_settings"])).provider_settings;
    await source.assertFrozen(view.epoch);
    if (
      migrationDigest({ provider_settings: raw }) !==
      view.manifest.sourceDigests.MG01
    )
      throw new Error("SOURCE_CHANGED");
    return raw;
  };
  async function call(
    kind: "migration.consensus.validate" | "migration.consensus.acknowledge",
    raw: Journal,
  ) {
    const view = migrationJournalSchema.parse(raw) as Journal;
    if (
      view.manifest.profileGuard !== profileGuard ||
      browser.profileGuard !== profileGuard ||
      !(
        kind === "migration.consensus.validate"
          ? ["copying", "validated"]
          : ["validated"]
      ).includes(view.phase)
    )
      throw new Error("MIGRATION_CONSENSUS_SCOPE");
    await verify(view);
    const ack =
      kind === "migration.consensus.acknowledge"
        ? await browser.acknowledge(view)
        : undefined;
    if (ack && !(await browser.verifyAcknowledgment(view)))
      throw new Error("ACK_REQUIRED");
    const result = migrationConsensusResultSchema.parse(
      await request(
        parseMigrationCommand({
          kind,
          profileGuard,
          migrationId: view.manifest.migrationId,
          epoch: view.epoch,
          revision: view.revision,
          sourceDigests: view.manifest.sourceDigests,
          manifestDigest: migrationDigest({
            manifest: view.manifest,
            stores: view.stores,
          }),
          secretMode: mode,
          source: await capture(view),
          ...(ack ? { ack } : {}),
        }),
      ),
    );
    const digest = migrationDigest({
      manifest: view.manifest,
      stores: view.stores,
    });
    const unchanged =
      kind === "migration.consensus.validate"
        ? view.phase === "validated"
        : view.acknowledgments.extension === digest &&
          view.acknowledgments.backend === digest;
    const revision = view.revision + (unchanged ? 0 : 1);
    if (
      result.profileGuard !== profileGuard ||
      result.migrationId !== view.manifest.migrationId ||
      result.epoch !== view.epoch ||
      result.revision !== revision ||
      result.manifestDigest !== digest ||
      migrationDigest(result.stores) !== migrationDigest(view.stores) ||
      Object.values(result.acknowledgments).some((value) => value !== digest) ||
      (kind === "migration.consensus.validate" &&
        migrationDigest(result.acknowledgments) !==
          migrationDigest(view.acknowledgments)) ||
      (ack &&
        (result.acknowledgments.extension !== digest ||
          result.acknowledgments.backend !== digest))
    )
      throw new Error("MIGRATION_CONSENSUS_SCOPE");
    const acknowledgments: Journal["acknowledgments"] = {};
    for (const owner of ["extension", "backend"] as const) {
      const value = result.acknowledgments[owner];
      if (value !== undefined) acknowledgments[owner] = value;
    }
    const next: Journal = {
      ...view,
      revision: result.revision,
      phase: "validated" as const,
      acknowledgments,
    };
    await verify(next);
    await capture(next);
    if (ack && !(await browser.verifyAcknowledgment(next)))
      throw new Error("ACK_REQUIRED");
    return next;
  }
  return {
    validate: (view: Journal) => call("migration.consensus.validate", view),
    acknowledge: (view: Journal) =>
      call("migration.consensus.acknowledge", view),
  };
}
