import { build } from "esbuild";
for (const [name, entry] of [
  ["engine", "packages/analysis-engine/src/index.ts"],
  ["responses", "packages/provider-adapters/src/responses/index.ts"],
  ["fixtures", "scripts/s34/sqlite-entry.ts"],
])
  await build({
    entryPoints: [entry],
    outfile: `dist/s34/${name}.mjs`,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
  });
console.log("S34 isolated backend builds PASS; product/version unchanged");
