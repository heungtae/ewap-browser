import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const roots = ["extension", "scripts", "native-host", "examples"];
const extensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".html",
  ".css",
  ".cs",
  ".ps1",
  ".sh",
]);
const ignoredDirectories = new Set([
  ".git",
  "bin",
  "dist",
  "dist-extension",
  "node_modules",
  "obj",
]);
const maxLines = 199;

const extensionOf = (file) => {
  const offset = file.lastIndexOf(".");
  return offset < 0 ? "" : file.slice(offset);
};

const sourceLines = (text) => {
  if (!text) return 0;
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines.length;
};

const filesUnder = async (root) => {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory())
        return ignoredDirectories.has(entry.name) ? [] : filesUnder(path);
      return entry.isFile() && extensions.has(extensionOf(entry.name))
        ? [path]
        : [];
    }),
  );
  return files.flat();
};

const files = (await Promise.all(roots.map(filesUnder))).flat().sort();
const oversized = [];
for (const file of files) {
  const lines = sourceLines(await readFile(file, "utf8"));
  if (lines > maxLines) oversized.push({ file: relative(".", file), lines });
}

if (oversized.length > 0) {
  console.error(`Source files must stay below ${maxLines + 1} lines:`);
  for (const item of oversized)
    console.error(`${String(item.lines).padStart(4)} ${item.file}`);
  process.exitCode = 1;
} else {
  console.log(`Source-size check passed for ${files.length} authored files.`);
}
