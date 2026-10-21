import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { files, read, digest, validateInventory } from "../s26-inventory.mjs";
const manifest = read("docs/baselines/s34/disposition.json");
for (const entry of read("docs/baselines/s33/disposition.json").files)
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
    /^(packages\/analysis-engine\/|packages\/provider-adapters\/src\/responses\/|extension\/tests\/unit\/migration\/s34\/|scripts\/s34\/|apps\/agent-server\/src\/analysis\/)/.test(
      p,
    ),
);
sources.push(
  "apps/agent-server/src/tasks/analysis-budget.ts",
  "apps/agent-server/src/settings/role-migration.ts",
  "apps/agent-server/src/settings/analyst-secrets.ts",
);
for (const path of sources)
  assert.ok(
    readFileSync(path, "utf8").trimEnd().split("\n").length <= 199,
    `source size ${path}`,
  );
for (const entry of [
  "packages/analysis-engine/src/index.ts",
  "packages/provider-adapters/src/responses/index.ts",
]) {
  const output = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: "node",
    metafile: true,
  });
  assert.ok(
    Object.keys(output.metafile.inputs).every(
      (p) =>
        !/^apps\/|^extension\/src\/|packages\/(task-engine|browser-runtime|collector|tool-runtime|tool-registry|policy-engine)|provider-adapters\/src\/jev\//.test(
          p,
        ),
    ),
    `analyst has no controller/executor dependency ${entry}`,
  );
}
console.log(
  JSON.stringify({
    result: "PASS",
    modules: sources.length,
    ...validateInventory(manifest),
    productionAndDesign: "unchanged",
  }),
);
