import type { PolicyMirrorPort } from "../../../../packages/policy-engine/src/migration-contract.js";
import type {
  BrowserMigrationUnit,
  MigrationStagingPort,
} from "../../../../packages/shared/src/migration-ports.js";
import type { FrozenSource } from "./local-staging.js";
import { Mg02Staging } from "./mg02-staging.js";
import { Mg03Staging } from "./mg03-staging.js";
import { Mg04Staging } from "./mg04-staging.js";
import { Mg05Staging } from "./mg05-staging.js";
import { Mg06Staging } from "./mg06-staging.js";
import { legacyStagingForCoordinator } from "./coordinator-staging.js";
export function browserMigrationUnits(
  db: IDBDatabase,
  local: FrozenSource,
  session: FrozenSource,
  mirror: PolicyMirrorPort,
  profile: string,
  now = Date.now,
): Record<BrowserMigrationUnit, MigrationStagingPort> {
  const permissions = new Mg02Staging(db, local);
  return {
    MG02: {
      sourceDigest: (epoch) => permissions.sourceDigest(epoch),
      async stage(id, epoch, expected) {
        const checkpoint = await permissions.stage(id, epoch, expected);
        await permissions.mirror(id, epoch, profile, mirror);
        return checkpoint;
      },
      async validate(id, epoch, checkpoint) {
        return (
          (await permissions.validate(id, epoch, checkpoint)) &&
          (await permissions.validateMirror(id, epoch, profile, mirror))
        );
      },
    },
    MG03: legacyStagingForCoordinator(new Mg03Staging(db, local)),
    MG04: legacyStagingForCoordinator(new Mg04Staging(db, session)),
    MG05: legacyStagingForCoordinator(new Mg05Staging(db, session)),
    MG06: new Mg06Staging(db, session, now),
  };
}
