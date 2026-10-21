import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { files, read, digest, validateInventory } from "../s26-inventory.mjs";
const manifest = read("docs/baselines/s33/disposition.json");
for (const entry of read("docs/baselines/s32/disposition.json").files)
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
    p.endsWith(".ts") &&
    /^(packages\/task-engine\/src\/orchestration\/|extension\/tests\/unit\/migration\/s33\/|scripts\/s33\/)/.test(
      p,
    ),
);
sources.push("apps/agent-server/src/tasks/orchestration-store.ts");
for (const path of sources)
  assert.ok(
    readFileSync(path, "utf8").trimEnd().split("\n").length <= 199,
    `source size ${path}`,
  );
const output = await build({
  entryPoints: ["packages/task-engine/src/orchestration/index.ts"],
  bundle: true,
  write: false,
  platform: "node",
  metafile: true,
});
assert.ok(
  Object.keys(output.metafile.inputs).every(
    (p) =>
      !/^apps\/|^extension\/src\/|packages\/(provider-adapters|browser-runtime|tool-runtime|policy-engine)/.test(
        p,
      ),
  ),
  "controller/executor isolation",
);
console.log(
  JSON.stringify({
    result: "PASS",
    modules: sources.length,
    ...validateInventory(manifest),
    productionAndDesign: "unchanged",
  }),
);
