import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
  captureReleaseSet,
  releaseSetId,
} from "../../../dist/s36/release-set.mjs";
export function releaseFixture() {
  const root = mkdtempSync(join(tmpdir(), "s36-release-"));
  const write = (path, value) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(
      join(root, path),
      typeof value === "string" ? value : JSON.stringify(value),
    );
  };
  write("chrome-extension/manifest.json", {
    version: "0.1.117",
    background: { service_worker: "js/service-worker.js" },
    permissions: ["nativeMessaging"],
  });
  write(
    "chrome-extension/js/service-worker.js",
    "// synthetic browser worker\n",
  );
  write("agent-server/launcher.cjs", "// synthetic backend artifact\n");
  write("dependencies/package.json", { version: "0.1.117" });
  write("dependencies/apps/agent-server/package.json", {
    name: "@contextpilot/agent-server",
    version: "0.0.0",
  });
  write("dependencies/apps/chrome-extension/package.json", {
    name: "@contextpilot/chrome-extension",
    version: "0.0.0",
  });
  write("dependencies/pnpm-lock.yaml", "lockfileVersion: '9.0'\n");
  write("dependencies/pnpm-workspace.yaml", "packages: [apps/*, packages/*]\n");
  const manifest = captureReleaseSet(root, {
    revision: "a".repeat(40),
    dirty: true,
  });
  write("release-set.json", manifest);
  return {
    root,
    write,
    manifest,
    id: releaseSetId(manifest),
    close() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
