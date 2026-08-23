import { readdir, readFile } from "node:fs/promises";
import {
  dirname,
  extname,
  join,
  normalize,
  relative,
  resolve,
} from "node:path";

const sourceRoot = resolve("extension/src");
const isTypeScript = (file) => extname(file) === ".ts";

const filesUnder = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory()
          ? filesUnder(path)
          : entry.isFile() && isTypeScript(path)
            ? [resolve(path)]
            : [];
      }),
    )
  ).flat();
};

const sourceFiles = await filesUnder(sourceRoot);
const known = new Set(sourceFiles);
const graph = new Map();
const importPattern = /from\s+["']([^"']+)["']/g;
for (const file of sourceFiles) {
  const imports = [];
  const text = await readFile(file, "utf8");
  for (const match of text.matchAll(importPattern)) {
    const specifier = match[1];
    if (!specifier?.startsWith(".")) continue;
    const candidate = normalize(
      resolve(dirname(file), specifier.replace(/\.js$/, ".ts")),
    );
    if (known.has(candidate)) imports.push(candidate);
  }
  graph.set(file, imports);
}

const failures = [];
const entry = /\/(service-worker|content|sidepanel|settings)\/entry\.ts$/;
for (const [file, imports] of graph) {
  for (const dependency of imports) {
    if (entry.test(dependency) && !entry.test(file))
      failures.push(
        `${relative(".", file)} imports entry point ${relative(".", dependency)}`,
      );
  }
}

const visiting = new Set();
const visited = new Set();
const stack = [];
const visit = (file) => {
  if (visiting.has(file)) {
    const cycle = [...stack.slice(stack.indexOf(file)), file]
      .map((item) => relative(".", item))
      .join(" -> ");
    failures.push(`import cycle: ${cycle}`);
    return;
  }
  if (visited.has(file)) return;
  visiting.add(file);
  stack.push(file);
  for (const dependency of graph.get(file) ?? []) visit(dependency);
  stack.pop();
  visiting.delete(file);
  visited.add(file);
};
for (const file of sourceFiles) visit(file);

if (failures.length > 0) {
  console.error("Module-boundary check failed:");
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log(
    `Module-boundary check passed for ${sourceFiles.length} TypeScript files.`,
  );
}
