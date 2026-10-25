import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { releaseFixture } from "../release/support.mjs";
export function installationFixture() {
  const release = releaseFixture();
  const root = mkdtempSync(join(tmpdir(), "s36-i-"));
  const input = {
    directory: `${root}/agent`,
    registry: `${root}/NativeMessagingHosts`,
    releaseDirectory: release.root,
    releaseId: release.id,
    extensionId: "a".repeat(32),
  };
  return {
    input,
    root,
    release,
    close() {
      release.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
