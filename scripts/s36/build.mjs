import { build } from "esbuild";
await build({
  entryPoints: ["scripts/s36/entry.ts"],
  outfile: "dist/s36/migration.mjs",
  platform: "node",
  format: "esm",
  bundle: true,
  target: "node22",
});
console.log("S36 isolated migration build PASS; product/version unchanged");
