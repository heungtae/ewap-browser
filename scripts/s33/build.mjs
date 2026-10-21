import { build } from "esbuild";
for (const [name, entry, platform] of [
  ["engine", "packages/task-engine/src/orchestration/index.ts", "node"],
  ["store", "scripts/s33/sqlite-entry.ts", "node"],
])
  await build({
    entryPoints: [entry],
    outfile: `dist/s33/${name}.mjs`,
    bundle: true,
    platform,
    format: "esm",
    target: platform === "node" ? "node22" : "chrome116",
  });
console.log("S33 isolated builds PASS; production/version unchanged");
