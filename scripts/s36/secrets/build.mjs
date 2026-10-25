import { build } from "esbuild";
import { copyFile, chmod } from "node:fs/promises";
await build({
  entryPoints: ["apps/agent-server/src/settings/linux-secret-store.ts"],
  outfile: "dist/s36/linux-secret-store.mjs",
  platform: "node",
  format: "esm",
  bundle: true,
  target: "node22",
});
await copyFile("native-host/secret-service.py", "dist/s36/secret-service.py");
await chmod("dist/s36/secret-service.py", 0o600);
console.log(
  "S36 Linux Secret Service adapter built; no default-store/product change",
);
