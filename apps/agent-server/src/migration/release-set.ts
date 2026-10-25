import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PROTOCOL } from "../../../../packages/shared/src/bridge.js";
import {
  releaseSetSchema,
  type ReleaseSet,
} from "../../../../packages/shared/src/release-set.js";
import { canonicalJson } from "../../../../extension/src/security/canonical.js";
import { releaseFiles, releaseHash, releaseJson } from "./release-files.js";
export const releaseSetId = (manifest: ReleaseSet) =>
  releaseHash(canonicalJson(releaseSetSchema.parse(manifest)));
export function releaseVersions(directory: string) {
  const extension = releaseJson(directory, "chrome-extension/manifest.json");
  const root = releaseJson(directory, "dependencies/package.json");
  const backend = releaseJson(
    directory,
    "dependencies/apps/agent-server/package.json",
  );
  const browser = releaseJson(
    directory,
    "dependencies/apps/chrome-extension/package.json",
  );
  if (
    extension.version !== root.version ||
    backend.name !== "@contextpilot/agent-server" ||
    browser.name !== "@contextpilot/chrome-extension"
  )
    throw new Error("RELEASE_VERSION");
  return {
    extension: extension.version as string,
    backend: backend.version as string,
    browserApp: browser.version as string,
  };
}
export function captureReleaseSet(
  directory: string,
  source: ReleaseSet["source"],
): ReleaseSet {
  if (
    readdirSync(directory).some(
      (name) =>
        ![
          "chrome-extension",
          "agent-server",
          "dependencies",
          "release-set.json",
        ].includes(name),
    )
  )
    throw new Error("RELEASE_EXTRA_ROOT");
  const files = releaseFiles(directory);
  for (const required of [
    "agent-server/launcher.cjs",
    "dependencies/pnpm-lock.yaml",
    "dependencies/pnpm-workspace.yaml",
  ])
    if (!files.some((file) => file.path === required))
      throw new Error("RELEASE_MISSING");
  const manifest = releaseJson(directory, "chrome-extension/manifest.json");
  const worker = (
    manifest.background as { service_worker?: unknown } | undefined
  )?.service_worker;
  if (
    typeof worker !== "string" ||
    !files.some((file) => file.path === `chrome-extension/${worker}`) ||
    !(manifest.permissions as unknown[] | undefined)?.includes(
      "nativeMessaging",
    )
  )
    throw new Error("RELEASE_EXTENSION");
  return releaseSetSchema.parse({
    schema: "wca.release-set/v1",
    scope: "qualification-only",
    source,
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.versions.node,
    nodeMajor: 22,
    credentials: "session-only",
    versions: releaseVersions(directory),
    protocol: PROTOCOL,
    files,
  });
}
// The expected ID must be pinned by a trusted caller outside this mutable artifact directory.
// Integrity qualification is only one prerequisite; it never opens product admission.
export function verifyReleaseSet(
  directory: string,
  expectedId: string,
): ReleaseSet {
  if (!/^[a-f0-9]{64}$/.test(expectedId)) throw new Error("RELEASE_ID");
  const manifestPath = resolve(directory, "release-set.json");
  const info = lstatSync(manifestPath);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 2 * 1024 * 1024)
    throw new Error("RELEASE_MANIFEST");
  const data = readFileSync(manifestPath);
  if (data.length > 2 * 1024 * 1024) throw new Error("RELEASE_LIMIT");
  const manifest = releaseSetSchema.parse(JSON.parse(data.toString("utf8")));
  if (releaseSetId(manifest) !== expectedId) throw new Error("RELEASE_ID");
  if (
    process.platform !== manifest.platform ||
    process.arch !== manifest.architecture ||
    Number(process.versions.node.split(".")[0]) < manifest.nodeMajor
  )
    throw new Error("RELEASE_RUNTIME");
  const actual = captureReleaseSet(directory, manifest.source);
  if (canonicalJson(actual) !== canonicalJson(manifest))
    throw new Error("RELEASE_CHANGED");
  return manifest;
}
export function releaseIntegrityPredicate(
  directory: string,
  expectedId: string,
) {
  return async (requestedId: string): Promise<boolean> => {
    if (requestedId !== expectedId) return false;
    try {
      verifyReleaseSet(directory, expectedId);
      return true;
    } catch {
      return false;
    }
  };
}
