import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { digest, read, root, validateInventory } from "../s26-inventory.mjs";
const base = read("docs/baselines/s27/disposition.json");
const manifest = read(process.argv[2] ?? "docs/baselines/s27/disposition.json");
for (const entry of base.files)
  assert.deepEqual(
    manifest.files.find((e) => e.path === entry.path),
    entry,
    `Historical disposition changed: ${entry.path}`,
  );
const result = validateInventory(manifest);
for (const [path, expected] of Object.entries(
  read("docs/baselines/s27/entry.json").preservedSourceHashes,
)) {
  assert.equal(
    digest(readFileSync(resolve(root, path))),
    expected,
    `Preserved source/design changed: ${path}`,
  );
}
console.log(
  JSON.stringify({
    result: "PASS",
    ...result,
    designAndProduction: "unchanged",
  }),
);
