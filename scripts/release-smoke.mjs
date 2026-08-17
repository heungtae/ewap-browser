import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const manifest = JSON.parse(
  await readFile(new URL("../dist-extension/manifest.json", import.meta.url)),
);
const required = [
  "js/service-worker.js",
  "js/content.js",
  "js/panel.js",
  "js/settings.js",
  "sidepanel/index.html",
  "settings/index.html",
];
if (
  manifest.manifest_version !== 3 ||
  JSON.stringify([...manifest.permissions].sort()) !==
    JSON.stringify(["activeTab", "debugger", "sidePanel", "storage"]) ||
  !manifest.host_permissions.includes("<all_urls>")
)
  throw new Error("release manifest is missing all-web-page host coverage");
for (const path of required)
  await readFile(new URL(`../dist-extension/${path}`, import.meta.url));
const manifestBytes = await readFile(
  new URL("../dist-extension/manifest.json", import.meta.url),
);
console.log(
  `release package smoke passed (manifest sha256=${createHash("sha256")
    .update(manifestBytes)
    .digest("hex")})`,
);
