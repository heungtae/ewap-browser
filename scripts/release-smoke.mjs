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
  "js/offscreen.js",
  "managed-storage-schema.json",
  "sidepanel/index.html",
  "settings/index.html",
  "offscreen/index.html",
];
if (
  manifest.manifest_version !== 3 ||
  JSON.stringify([...manifest.permissions].sort()) !==
    JSON.stringify([
      "activeTab",
      "debugger",
      "offscreen",
      "sidePanel",
      "storage",
      "tabs",
    ]) ||
  !manifest.host_permissions.includes("<all_urls>") ||
  !manifest.host_permissions.includes("http://localhost/*") ||
  !manifest.host_permissions.includes("http://127.0.0.1/*") ||
  manifest.storage?.managed_schema !== "managed-storage-schema.json"
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
