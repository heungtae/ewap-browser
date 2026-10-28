import type { BrowserMigrationPort } from "../../../../packages/shared/src/migration-ports.js";
import { mg02SourceKeys } from "../../../../packages/policy-engine/src/migration-contract.js";
import { sourceKeys } from "./mg03-types.js";
import { mg05Keys } from "./mg05-convert.js";
import type { FrozenSource } from "./local-staging.js";
import { watchFrozenSource, type StorageChanges } from "./source-watch.js";

// The caller must establish writer freeze/drain before observation begins.
export async function observeMigrationOwner(
  owner: BrowserMigrationPort,
  localSource: FrozenSource,
  sessionSource: FrozenSource,
  events: StorageChanges,
  epoch: number,
) {
  const local = watchFrozenSource(
    localSource,
    events,
    "local",
    ["provider_settings", ...mg02SourceKeys, ...sourceKeys],
    epoch,
  );
  let session: ReturnType<typeof watchFrozenSource> | undefined;
  try {
    session = watchFrozenSource(
      sessionSource,
      events,
      "session",
      ["chat_session_v1", ...mg05Keys, "execution_diagnostics_v1"],
      epoch,
    );
    const guard = async (current: number) => {
      await local.assertFrozen(current);
      await session!.assertFrozen(current);
      await owner.assertFrozen(current);
      await local.assertFrozen(current);
      await session!.assertFrozen(current);
    };
    await guard(epoch);
    const call = async <T>(current: number, operation: () => Promise<T>) => {
      await guard(current);
      const result = await operation();
      await guard(current);
      return result;
    };
    const monitored: BrowserMigrationPort = {
      profileGuard: owner.profileGuard,
      assertFrozen: guard,
      freezeAndDrain: (current) =>
        call(current, () => owner.freezeAndDrain(current)),
      sourceDigest: (unit, current) =>
        call(current, () => owner.sourceDigest(unit, current)),
      stage: (unit, manifest, current) =>
        call(current, () => owner.stage(unit, manifest, current)),
      validate: (unit, id, current, checkpoint) =>
        call(current, () => owner.validate(unit, id, current, checkpoint)),
      acknowledge: (view) => call(view.epoch, () => owner.acknowledge(view)),
      verifyAcknowledgment: (view) =>
        call(view.epoch, () => owner.verifyAcknowledgment(view)),
    };
    return {
      owner: monitored,
      local,
      session,
      dispose() {
        local.dispose();
        session!.dispose();
      },
    };
  } catch (error) {
    local.dispose();
    session?.dispose();
    throw error;
  }
}
