import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { files, read, digest, validateInventory } from "../s26-inventory.mjs";
const manifest = read("docs/baselines/s36/disposition.json");
for (const entry of read("docs/baselines/s35/disposition.json").files)
  assert.deepEqual(
    manifest.files.find((item) => item.path === entry.path),
    entry,
  );
for (const [path, expected] of Object.entries(
  read("docs/baselines/s27/entry.json").preservedSourceHashes,
))
  assert.equal(digest(readFileSync(path)), expected, path);
const sources = files().filter(
  (path) =>
    /\.(ts|mjs)$/.test(path) &&
    /^(apps\/agent-server\/src\/migration\/|extension\/tests\/unit\/migration\/s36\/|scripts\/s36\/)/.test(
      path,
    ),
);
for (const path of sources)
  assert.ok(
    readFileSync(path, "utf8").trimEnd().split("\n").length <= 199,
    path,
  );
console.log(
  JSON.stringify({
    result: "PASS",
    modules: sources.length,
    ...validateInventory(manifest),
    productionAndDesign: "unchanged",
  }),
);
