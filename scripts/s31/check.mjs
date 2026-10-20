import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { read, files, digest, validateInventory } from "../s26-inventory.mjs";
const manifest = read("docs/baselines/s31/disposition.json");
for (const entry of read("docs/baselines/s30/disposition.json").files)
  assert.deepEqual(
    manifest.files.find((e) => e.path === entry.path),
    entry,
    `historical owner ${entry.path}`,
  );
for (const [path, expected] of Object.entries(
  read("docs/baselines/s27/entry.json").preservedSourceHashes,
))
  assert.equal(
    digest(readFileSync(path)),
    expected,
    `production/design ${path}`,
  );
const sources = files().filter(
  (p) =>
    /^(apps\/agent-server\/src\/tasks\/|packages\/task-engine\/src\/durable\/|extension\/tests\/(unit\/migration|fixture)\/s31\/)/.test(
      p,
    ) && p.endsWith(".ts"),
);
sources.push(
  "packages/browser-runtime/src/revocation.ts",
  "apps/chrome-extension/src/runtime/durable-dispatch.ts",
);
for (const path of sources)
  assert.ok(
    readFileSync(path, "utf8").trimEnd().split("\n").length <= 199,
    `source size ${path}`,
  );
const output = await build({
  entryPoints: ["packages/task-engine/src/durable/index.ts"],
  bundle: true,
  write: false,
  platform: "browser",
  metafile: true,
});
assert.ok(
  Object.keys(output.metafile.inputs).every(
    (p) =>
      !/^apps\/|^extension\/src\/|packages\/(provider-adapters|browser-runtime)/.test(
        p,
      ),
  ),
  "engine authority boundary",
);
console.log(
  JSON.stringify({
    result: "PASS",
    modules: sources.length,
    ...validateInventory(manifest),
    productionAndDesign: "unchanged",
  }),
);
