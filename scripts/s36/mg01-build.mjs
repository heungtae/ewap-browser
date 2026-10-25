import { build } from "esbuild";
await build({
  entryPoints: ["scripts/s36/mg01-entry.ts"],
  outfile: "dist/s36/mg01.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
});
console.log("MG01 isolated backend build PASS; product/version unchanged");
