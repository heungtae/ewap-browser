import { readFile } from "node:fs/promises";
const manifest = JSON.parse(
  await readFile(new URL("../extension/manifest.json", import.meta.url)),
);
if (
  manifest.manifest_version !== 3 ||
  !manifest.background?.service_worker ||
  !manifest.side_panel?.default_path ||
  !manifest.options_ui?.page ||
  !manifest.permissions?.includes("debugger") ||
  manifest.permissions.includes("offscreen")
)
  throw new Error("invalid MV3 smoke manifest");
console.log("MV3 manifest and entry points are loadable");
