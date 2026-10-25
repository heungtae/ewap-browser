import { Mg02Staging } from "../../../../apps/chrome-extension/src/migration/mg02-staging.js";
import { migrationTransport } from "../../../../apps/chrome-extension/src/migration/rpc.js";
import { openDatabase } from "../../../../packages/codebase-repository/src/database.js";
import { policySource } from "../../unit/migration/s36/mg02-support.js";
import type { FrozenSource } from "../../../../apps/chrome-extension/src/migration/local-staging.js";
import type { MigrationCommand } from "../../../../packages/shared/src/migration-rpc.js";
export function policyFixture(
  source: FrozenSource,
  request: (value: MigrationCommand) => Promise<unknown>,
  write: (value: Record<string, unknown>) => Promise<void>,
) {
  let stage: Mg02Staging, profile: string, digest: string;
  const backend = () => migrationTransport(profile, request).port;
  return {
    async prepare(profileGuard: string) {
      profile = profileGuard;
      await write(policySource());
      stage = new Mg02Staging(await openDatabase(indexedDB, profile), source);
      digest = await stage.sourceDigest(1);
      return digest;
    },
    async copy() {
      await stage.stage("wire", 1, digest);
      await stage.mirror("wire", 1, profile, backend());
      if (!(await stage.validateMirror("wire", 1, profile, backend())))
        throw new Error("POLICY_MIRROR_INVALID");
      return true;
    },
    async validate() {
      if (!(await stage.validateMirror("wire", 1, profile, backend())))
        throw new Error("POLICY_MIRROR_INVALID");
      return true;
    },
    async wrongEpoch() {
      try {
        await stage.validateMirror("wire", 2, profile, backend());
      } catch {
        return true;
      }
      throw new Error("POLICY_EPOCH_ACCEPTED");
    },
    async drift() {
      const original = policySource();
      await write({
        agent_preferences: {
          ...original.agent_preferences,
          page_method_enabled: false,
        },
      });
      let rejected = false;
      try {
        rejected = !(await stage.validateMirror("wire", 1, profile, backend()));
      } catch {
        rejected = true;
      } finally {
        await write(original);
      }
      if (!rejected) throw new Error("POLICY_SOURCE_DRIFT_ACCEPTED");
      return true;
    },
  };
}
