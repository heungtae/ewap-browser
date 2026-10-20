import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { files, read, digest, validateInventory } from "../s26-inventory.mjs";
const roots = [
  "tool-registry",
  "tool-runtime",
  "policy-engine",
  "browser-runtime",
];
const sources = files().filter(
  (p) =>
    (roots.some((r) => p.startsWith(`packages/${r}/src/`)) ||
      p.startsWith("apps/chrome-extension/src/runtime/") ||
      /^extension\/tests\/(fixture|unit\/migration)\/s30\//.test(p)) &&
    p.endsWith(".ts"),
);
for (const path of sources)
  assert.ok(
    (await readFile(path, "utf8")).trimEnd().split("\n").length <= 199,
    `source-size ${path}`,
  );
for (const name of roots) {
  const output = await build({
    entryPoints: [`packages/${name}/src/index.ts`],
    bundle: true,
    platform: "browser",
    write: false,
    metafile: true,
  });
  assert.ok(
    Object.keys(output.metafile.inputs).every(
      (p) =>
        !p.startsWith("extension/src/") &&
        !p.startsWith("apps/") &&
        !/packages\/(provider-adapters|task-engine)/.test(p),
    ),
    `authority import ${name}`,
  );
}
for (const [path, expected] of Object.entries(
  read("docs/baselines/s27/entry.json").preservedSourceHashes,
))
  assert.equal(
    digest(await readFile(path)),
    expected,
    `production/design ${path}`,
  );
const manifest = read("docs/baselines/s30/disposition.json");
for (const entry of read("docs/baselines/s29/disposition.json").files)
  assert.deepEqual(
    manifest.files.find((e) => e.path === entry.path),
    entry,
    `historical owner ${entry.path}`,
  );
console.log(
  JSON.stringify({
    result: "PASS",
    modules: sources.length,
    ...validateInventory(manifest),
    productionAndDesign: "unchanged",
  }),
);
