import { currentPreservedSourceHashes } from "../s26-inventory.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  digest,
  read,
  root,
  validateInventory,
  validateCurrentInventory,
} from "../s26-inventory.mjs";
const manifest = read(process.argv[2] ?? "docs/baselines/s27/disposition.json");
const entries = new Map(manifest.files.map((entry) => [entry.path, entry]));
for (const path of [
  "docs/baselines/s27/disposition.json",
  ...(process.argv[2] === "docs/baselines/s27-v2/disposition.json"
    ? ["docs/baselines/s36-observed-restart/disposition.json"]
    : []),
])
  for (const entry of read(path).files)
    assert.deepEqual(
      entries.get(entry.path),
      entry,
      `Historical disposition changed: ${entry.path}`,
    );
const result =
  process.argv[2] === "docs/baselines/s27-v2/disposition.json"
    ? validateCurrentInventory(manifest)
    : validateInventory(manifest);
for (const [path, expected] of Object.entries(currentPreservedSourceHashes())) {
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
    designAndProduction:
      "baseline with authorized S25 source and S27 status changes",
  }),
);
