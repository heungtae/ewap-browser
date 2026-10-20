import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import ts from "typescript";
import { files, read, digest, validateInventory } from "../s26-inventory.mjs";
const roots = [
  "collector",
  "codebase-schema",
  "codebase-builder",
  "codebase-repository",
];
const sources = files().filter(
  (p) =>
    roots.some((r) => p.startsWith(`packages/${r}/src/`)) && p.endsWith(".ts"),
);
const fixtureFiles = files().filter((p) =>
  /^extension\/tests\/(fixture|unit\/migration)\/s29\/.*\.ts$/.test(p),
);
for (const file of [...sources, ...fixtureFiles]) {
  const text = await readFile(file, "utf8");
  assert.ok(text.trimEnd().split("\n").length <= 199, `source-size ${file}`);
  const parsed = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    )
      assert.ok(
        !["querySelectorAll", "eval"].includes(node.expression.name.text),
        `unbounded/eval ${file}`,
      );
    ts.forEachChild(node, visit);
  };
  visit(parsed);
}
for (const name of roots) {
  const result = await build({
    entryPoints: [`packages/${name}/src/index.ts`],
    bundle: true,
    platform: "browser",
    write: false,
    metafile: true,
  });
  assert.ok(
    Object.keys(result.metafile.inputs).every(
      (p) =>
        !p.startsWith("extension/src/") &&
        !p.startsWith("apps/") &&
        !/packages\/(provider-adapters|task-engine)/.test(p),
    ),
    `authority import ${name}`,
  );
  assert.ok(
    Object.values(result.metafile.outputs)
      .flatMap((o) => o.imports)
      .every((i) => !i.path.startsWith("node:")),
    `Node import ${name}`,
  );
}
for (const [path, expected] of Object.entries(
  read("docs/baselines/s27/entry.json").preservedSourceHashes,
))
  assert.equal(
    digest(await readFile(path)),
    expected,
    `production/design ${path}`,
  );
const manifest = read(process.argv[2] ?? "docs/baselines/s29/disposition.json");
for (const entry of read("docs/baselines/s28/disposition.json").files)
  assert.deepEqual(
    manifest.files.find((e) => e.path === entry.path),
    entry,
    `historical owner ${entry.path}`,
  );
console.log(
  JSON.stringify({
    result: "PASS",
    modules: sources.length,
    ...validateInventory(manifest),
    productionAndDesign: "unchanged",
  }),
);
