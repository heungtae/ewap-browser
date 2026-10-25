import { build } from "esbuild";
import { copyFile, chmod } from "node:fs/promises";
import assert from "node:assert/strict";
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
const daemon = await build({
  entryPoints: ["scripts/s36/secrets/daemon.mjs"],
  outfile: "dist/s36/migration-daemon.mjs",
  platform: "node",
  format: "esm",
  bundle: true,
  target: "node22",
  metafile: true,
});
assert.ok(
  Object.keys(daemon.metafile.inputs).every(
    (path) =>
      !path.includes("/tests/") && !path.startsWith("scripts/s36/transport/"),
  ),
  "packaged daemon must not include qualification fixtures",
);
console.log(
  "S36 Linux Secret Service adapter built; no default-store/product change",
);
