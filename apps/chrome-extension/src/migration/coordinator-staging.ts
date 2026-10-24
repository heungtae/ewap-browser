import type { Checkpoint } from "../../../agent-server/src/migration/coordinator.js";
import { hexDigest, browserDigest } from "./migration-digest.js";
interface Staging {
  sourceDigest(epoch: number): Promise<string>;
  stage(id: string, epoch: number, sourceDigest: string): Promise<Checkpoint>;
  validate(id: string, epoch: number, checkpoint: Checkpoint): Promise<boolean>;
}
const encode = (
  checkpoint: Checkpoint,
  convert: (digest: string) => string,
): Checkpoint => ({
  ...checkpoint,
  sourceDigest: convert(checkpoint.sourceDigest),
  targetDigest: convert(checkpoint.targetDigest),
});
// Explicit adapter for existing MG03/MG04/MG05 Browser-base64url/v1 staging.
// MG06 already returns coordinator-hex/v1 and must not be wrapped here.
// This adapts integrity metadata only; it cannot open admission or grant authority.
export function legacyStagingForCoordinator(legacy: Staging): Staging {
  return {
    async sourceDigest(epoch) {
      return hexDigest(await legacy.sourceDigest(epoch));
    },
    async stage(id, epoch, digest) {
      return encode(
        await legacy.stage(id, epoch, browserDigest(digest)),
        hexDigest,
      );
    },
    async validate(id, epoch, checkpoint) {
      return legacy.validate(id, epoch, encode(checkpoint, browserDigest));
    },
  };
}
