import { build } from "esbuild";
await build({
  entryPoints: ["apps/agent-server/src/settings/linux-secret-store.ts"],
  outfile: "dist/s36/linux-secret-store.mjs",
  platform: "node",
  format: "esm",
  bundle: true,
  target: "node22",
});
console.log(
  "S36 Linux Secret Service adapter built; no default-store/product change",
);
