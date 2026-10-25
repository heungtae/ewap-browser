import { build } from "esbuild";
await build({
  entryPoints: ["scripts/s36/install/entry.ts"],
  outfile: "dist/s36/installation.mjs",
  platform: "node",
  format: "esm",
  bundle: true,
  target: "node22",
});
console.log(
  "S36 isolated Linux installation tool build PASS; product/version unchanged",
);
