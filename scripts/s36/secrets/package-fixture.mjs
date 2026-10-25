import { copyFileSync, chmodSync } from "node:fs";
import {
  captureReleaseSet,
  releaseSetId,
} from "../../../dist/s36/release-set.mjs";
import { releaseFixture } from "../release/support.mjs";
export function secretPackage() {
  const f = releaseFixture();
  for (const name of [
    "linux-secret-store.mjs",
    "secret-service.py",
    "migration-daemon.mjs",
  ]) {
    copyFileSync(`dist/s36/${name}`, `${f.root}/agent-server/${name}`);
    chmodSync(`${f.root}/agent-server/${name}`, 0o600);
  }
  const manifest = captureReleaseSet(f.root, f.manifest.source);
  f.write("release-set.json", manifest);
  return {
    ...f,
    manifest,
    id: releaseSetId(manifest),
    daemon: `${f.root}/agent-server/migration-daemon.mjs`,
  };
}
