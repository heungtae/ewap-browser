import { build } from "esbuild";
await build({
  entryPoints: ["apps/agent-server/src/migration/installation.ts"],
  outfile: "dist/s36/installation.mjs",
  platform: "node",
  format: "esm",
  bundle: true,
  target: "node22",
});
console.log(
  "S36 isolated Linux installation tool build PASS; product/version unchanged",
);
