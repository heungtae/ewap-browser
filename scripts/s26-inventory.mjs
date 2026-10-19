import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

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
