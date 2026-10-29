import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

export const root = resolve(import.meta.dirname, "..");
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" });
export const files = () =>
  [
    ...new Set(
      git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
        .split("\0")
        .filter(Boolean),
    ),
  ].sort();
export const read = (path) =>
  JSON.parse(readFileSync(resolve(root, path), "utf8"));
export const save = (path, value) =>
  writeFileSync(resolve(root, path), JSON.stringify(value, null, 2) + "\n");
export const manifestPath = "docs/baselines/s26/disposition.json";
// Preserve the historical baseline while pinning the user-authorized S25
// score-gate removals and S27 status metadata. Other hashes remain unchanged.
export function currentPreservedSourceHashes() {
  const hashes = {
    ...read("docs/baselines/s27/entry.json").preservedSourceHashes,
  };
  const changes = {
    "docs/sprints/s27-jev-controller-contract.md": [
      "e0e8862376d50dff70625a3b5f79c1440fc10379509eae621bd30fccf41f87a1",
      "1c4d63e0be76fc02abe041119cebe5b595a43c17d274fc0101ede8264c2f5788",
    ],
    "extension/src/providers/jev-response.ts": [
      "77a54a008950cd818c40a22fedee8c8dbcd06267036a855d4de3c22da54204dc",
      "bbd651a4a88838574869f6086a61822262c6368ba30f971969602796b5892115",
    ],
    "extension/src/providers/decision-coordinator.ts": [
      "188eb89c25ddaf7e219cd3b67ec625801b82902eac0c52ddcbb74f418a18f673",
      "4c644650bd65249e4013acc24b5a5fa62ba3e3a5b1aa5fbcf4f0f087d951d0a5",
    ],
  };
  for (const [path, [previous, current]] of Object.entries(changes)) {
    if (hashes[path] !== previous)
      throw new Error(`Historical hash changed: ${path}`);
    hashes[path] = current;
  }
  return hashes;
}
export function validateInventory(manifest, currentFiles = files()) {
  const entries = new Map();
  for (const entry of manifest.files) {
    if (entries.has(entry.path)) throw new Error(`Duplicate: ${entry.path}`);
    if (!/^RF(0[1-9]|[12][0-9]|30)$/.test(entry.owner))
      throw new Error(`Unknown owner: ${entry.path}`);
    if (!manifest.units[entry.owner]?.sprints.includes(entry.sprint))
      throw new Error(`Wrong Sprint: ${entry.path}`);
    if (
      !entry.target ||
      !["reuse", "replace", "preserve", "import", "retire"].includes(
        entry.disposition,
      )
    )
      throw new Error(`Missing disposition: ${entry.path}`);
    entries.set(entry.path, entry);
  }
  for (const path of currentFiles)
    if (!entries.has(path)) throw new Error(`Unmapped file: ${path}`);
  for (const path of entries.keys())
    if (!currentFiles.includes(path)) throw new Error(`Missing file: ${path}`);
  return {
    files: entries.size,
    owners: new Set(manifest.files.map((e) => e.owner)).size,
  };
}
export function validateCurrentInventory(manifest, currentFiles = files()) {
  const prior = read("docs/baselines/s36-observed-restart/disposition.json");
  if (!isDeepStrictEqual(manifest.units, prior.units))
    throw new Error("Historical inventory units changed");
  const entries = new Map(manifest.files.map((entry) => [entry.path, entry]));
  for (const entry of prior.files)
    if (!isDeepStrictEqual(entries.get(entry.path), entry))
      throw new Error(`Historical disposition changed: ${entry.path}`);
  return validateInventory(manifest, currentFiles);
}
if (process.argv[1] === resolve(import.meta.filename)) {
  const result = validateInventory(read(manifestPath));
  const baseline = read("docs/baselines/s26/source-baseline.json");
  for (const [path, expected] of Object.entries(baseline.source_hashes)) {
    if (
      !path.startsWith("extension/") &&
      !path.startsWith("docs/architecture/")
    )
      continue;
    if (digest(readFileSync(resolve(root, path))) !== expected)
      throw new Error(`Frozen production/design changed: ${path}`);
  }
  console.log(JSON.stringify({ result: "PASS", ...result }));
}
