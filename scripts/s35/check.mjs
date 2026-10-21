import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { files, read, digest, validateInventory } from "../s26-inventory.mjs";
const manifest = read("docs/baselines/s35/disposition.json");
for (const entry of read("docs/baselines/s34/disposition.json").files)
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
    /\.(ts|mjs)$/.test(p) &&
    /^(apps\/mcp-server\/src\/|apps\/agent-server\/src\/(mcp|integrations)\/|packages\/integration-adapters\/src\/|extension\/tests\/unit\/migration\/s35\/|scripts\/s35\/)/.test(
      p,
    ),
);
for (const path of sources)
  assert.ok(
    readFileSync(path, "utf8").trimEnd().split("\n").length <= 199,
    `source size ${path}`,
  );
for (const [entry, forbidden] of [
  [
    "apps/mcp-server/src/entry.ts",
    /^extension\/src\/|^apps\/(agent-server|chrome-extension)\/|packages\/(browser-runtime|tool-runtime|policy-engine|provider-adapters|analysis-engine|task-engine)\//,
  ],
  [
    "apps/agent-server/src/mcp/backend.ts",
    /^extension\/src\/|^apps\/chrome-extension\/|packages\/(browser-runtime|provider-adapters|analysis-engine)\//,
  ],
]) {
  const output = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: "node",
    metafile: true,
  });
  assert.ok(
    Object.keys(output.metafile.inputs).every((p) => !forbidden.test(p)),
    `gateway authority ${entry}`,
  );
}
const legacy = await build({
  entryPoints: [
    "apps/agent-server/src/integrations/imports.ts",
    "apps/agent-server/src/integrations/legacy-consumers.ts",
  ],
  outdir: "/tmp/s35-contract-check",
  bundle: true,
  write: false,
  platform: "node",
  metafile: true,
});
assert.ok(
  Object.keys(legacy.metafile.inputs)
    .filter((p) => p.startsWith("extension/src/"))
    .every(
      (p) =>
        /^extension\/src\/(profile|contracts|security|studio)\//.test(p) ||
        p === "extension/src/policy/enterprise-policy.ts",
    ),
  "bounded retained legacy seam",
);
console.log(
  JSON.stringify({
    result: "PASS",
    modules: sources.length,
    ...validateInventory(manifest),
    productionAndDesign: "unchanged",
  }),
);
