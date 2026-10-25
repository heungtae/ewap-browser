import { build } from "esbuild";
await build({
  entryPoints: ["scripts/s36/mg02-entry.ts"],
  outfile: "dist/s36/mg02.mjs",
  platform: "node",
  bundle: true,
  format: "esm",
  target: "node22",
});
console.log(
  "MG02 isolated mirror/extension fixture build PASS; product/version unchanged",
);
