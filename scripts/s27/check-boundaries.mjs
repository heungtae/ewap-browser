import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import ts from "typescript";
import { build } from "esbuild";
const roots = ["packages/task-engine", "packages/provider-adapters"];
const files = async (dir) =>
  (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory() && e.name !== "node_modules"
          ? files(`${dir}/${e.name}`)
          : e.isFile() && e.name.endsWith(".ts")
            ? [`${dir}/${e.name}`]
            : [],
      ),
    )
  ).flat();
let count = 0;
for (const root of roots) {
  const manifest = JSON.parse(await readFile(`${root}/package.json`, "utf8"));
  for (const target of Object.values(manifest.exports))
    assert.ok(resolve(root, target).startsWith(resolve(root, "src") + "/"));
  for (const file of await files(`${root}/src`)) {
    const source = await readFile(file, "utf8");
    count++;
    assert.ok(
      source.trimEnd().split("\n").length <= 199,
      `source-size ${file}`,
    );
    const parsed = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node) => {
      if (
        root.endsWith("task-engine") &&
        ts.isIdentifier(node) &&
        [
          "fetch",
          "XMLHttpRequest",
          "WebSocket",
          "chrome",
          "browser",
          "eval",
          "Function",
        ].includes(node.text)
      )
        throw new Error(`privileged/global provider access ${file}`);
      let specifier;
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier
      )
        specifier = node.moduleSpecifier;
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === "require"))
      )
        specifier = node.arguments[0];
      if (specifier) {
        assert.ok(ts.isStringLiteral(specifier), `computed import ${file}`);
        const value = specifier.text;
        if (value.startsWith("."))
          assert.ok(
            resolve(dirname(file), value).startsWith(
              resolve(root, "src") + "/",
            ),
            `private cross-package import ${file}`,
          );
        else
          assert.ok(
            value === "zod" ||
              (root.endsWith("provider-adapters") &&
                value === "@contextpilot/task-engine/decisions") ||
              (file.endsWith("/digest.ts") && value === "node:crypto"),
            `forbidden dependency ${file}: ${value}`,
          );
      }
      ts.forEachChild(node, visit);
    };
    visit(parsed);
  }
}
for (const file of [
  ...(await files("extension/tests/unit/migration/s27")),
  ...(await readdir("extension/tests/fixture"))
    .filter((name) => name.startsWith("s27-") && name.endsWith(".ts"))
    .map((name) => `extension/tests/fixture/${name}`),
]) {
  assert.ok(
    (await readFile(file, "utf8")).trimEnd().split("\n").length <= 199,
    `source-size ${file}`,
  );
}
const bundle = await build({
  entryPoints: ["packages/provider-adapters/src/jev/index.ts"],
  bundle: true,
  platform: "node",
  write: false,
  metafile: true,
});
assert.ok(
  Object.keys(bundle.metafile.inputs).every(
    (file) => !file.startsWith("extension/"),
  ),
  "legacy runtime in target graph",
);
assert.ok(
  Object.values(bundle.metafile.outputs)
    .flatMap((output) => output.imports)
    .every((item) => item.path === "node:crypto"),
  "unexpected bundle external",
);
console.log(
  `S27 boundaries PASS: ${count} modules, package exports and built dependency graph; no GPT/legacy executor dependency`,
);
