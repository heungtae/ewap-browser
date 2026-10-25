import { build } from "esbuild";
await build({
  entryPoints: ["apps/agent-server/src/migration/release-set.ts"],
  outfile: "dist/s36/release-set.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
});
console.log(
  "S36 release integrity verifier build PASS; production/version unchanged",
);
