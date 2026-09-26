import { readFile, readdir, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import "./validate-package.mjs";

const manifest = JSON.parse(
  await readFile(new URL("../dist-extension/manifest.json", import.meta.url)),
);
const source = JSON.parse(
  await readFile(new URL("../extension/manifest.json", import.meta.url)),
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
    JSON.stringify([...source.permissions].sort()) ||
  JSON.stringify(manifest.host_permissions) !==
    JSON.stringify(source.host_permissions) ||
  JSON.stringify(manifest.optional_host_permissions) !==
    JSON.stringify(source.optional_host_permissions) ||
  manifest.version !== source.version ||
  manifest.storage?.managed_schema !== "managed-storage-schema.json"
)
  throw new Error(
    "release manifest differs from the validated source manifest",
  );
for (const path of required)
  await readFile(new URL(`../dist-extension/${path}`, import.meta.url));
const root = new URL("../dist-extension/", import.meta.url).pathname;
const inspect = async (directory, prefix = "") => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    const path = join(directory, entry.name);
    if ((await lstat(path)).isSymbolicLink())
      throw new Error(`release package contains symlink: ${relative}`);
    if (
      /claude|\.map$|\.pem$|\.key$|(?:^|\/)\.env(?:\.|$)|(?:^|\/)license/i.test(
        relative,
      )
    )
      throw new Error(
        `release package contains forbidden artifact: ${relative}`,
      );
    if (entry.isDirectory()) await inspect(path, `${relative}/`);
  }
};
await inspect(root);
const manifestBytes = await readFile(
  new URL("../dist-extension/manifest.json", import.meta.url),
);
console.log(
  `release package smoke passed (manifest sha256=${createHash("sha256")
    .update(manifestBytes)
    .digest("hex")})`,
);
