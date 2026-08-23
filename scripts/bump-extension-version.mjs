import { readFile, writeFile } from "node:fs/promises";

const files = [
  ["package.json", "version"],
  ["extension/manifest.json", "version"],
  ["deployment/compatibility.example.json", "extension_version"],
];
const versionPattern = /^(\d+)\.(\d+)\.(\d+)$/;

const readJson = async (path) => {
  const text = await readFile(path, "utf8");
  return { text, json: JSON.parse(text) };
};
const bumpPatch = (version) => {
  const match = versionPattern.exec(version);
  if (!match) throw new Error(`unsupported extension version: ${version}`);
  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
};

const values = await Promise.all(
  files.map(async ([path, key]) => ({ path, key, ...(await readJson(path)) })),
);
const current = values[0].json[values[0].key];
if (typeof current !== "string") throw new Error("package version is missing");
if (values.some(({ json, key }) => json[key] !== current))
  throw new Error("extension version metadata is out of sync");

const next = bumpPatch(current);
if (process.argv.includes("--dry-run")) {
  console.log(`extension version: ${current} -> ${next}`);
} else {
  await Promise.all(
    values.map(({ path, key, text }) => {
      const field = new RegExp(`("${key}"\\s*:\\s*)"${current}"`);
      const updated = text.replace(field, `$1"${next}"`);
      if (updated === text)
        throw new Error(`extension version field is missing: ${path}`);
      return writeFile(path, updated);
    }),
  );
  console.log(`extension version bumped: ${current} -> ${next}`);
}
