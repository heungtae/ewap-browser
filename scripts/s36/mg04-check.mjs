import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { files, read, digest, validateInventory } from "../s26-inventory.mjs";
const manifest = read("docs/baselines/s36-mg04/disposition.json");
for (const entry of read("docs/baselines/s36-mg03/disposition.json").files)
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
    /^(apps\/chrome-extension\/src\/migration\/|extension\/tests\/(unit\/migration|fixture)\/s36\/mg0[34]|scripts\/s36\/mg0[34])/.test(
      path,
    ),
);
for (const path of sources)
  assert.ok(
    readFileSync(path, "utf8").trimEnd().split("\n").length <= 199,
    path,
  );
const output = await build({
  entryPoints: [
    "apps/chrome-extension/src/migration/mg04-staging.ts",
    "apps/chrome-extension/src/migration/mg03-staging.ts",
  ],
  outdir: "/tmp/s36-mg04-boundary",
  bundle: true,
  write: false,
  platform: "browser",
  metafile: true,
  format: "esm",
});
assert.ok(
  Object.keys(output.metafile.inputs).every(
    (path) =>
      !path.startsWith("apps/agent-server/") &&
      !path.includes("/service-worker/") &&
      !path.includes("/provider-adapters/") &&
      !path.includes("/tool-runtime/"),
  ),
  "no execution/backend imports",
);
console.log(
  JSON.stringify({
    result: "PASS",
    ...validateInventory(manifest),
    modules: sources.length,
    browserBoundary: "PASS",
    productionAndDesign: "unchanged",
  }),
);
