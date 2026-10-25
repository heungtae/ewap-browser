import { build } from "esbuild";
await build({
  entryPoints: ["scripts/s36/integration/entry.ts"],
  outfile: "dist/s36/integration.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
});
console.log(
  "S36 six-unit controlled fixture bundle PASS; product/version unchanged",
);
