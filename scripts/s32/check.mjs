import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import { files, read, digest, validateInventory } from "../s26-inventory.mjs";
const manifest = read("docs/baselines/s32/disposition.json");
for (const entry of read("docs/baselines/s31/disposition.json").files)
  assert.deepEqual(
    manifest.files.find((e) => e.path === entry.path),
    entry,
    `historical owner ${entry.path}`,
  );
for (const [path, expected] of Object.entries(
  read("docs/baselines/s27/entry.json").preservedSourceHashes,
))
  assert.equal(
    digest(readFileSync(path)),
    expected,
    `preserved production/design ${path}`,
  );
const sources = files().filter(
  (p) =>
    p.endsWith(".ts") &&
    /^(packages\/collector\/src\/advanced\/|packages\/browser-runtime\/src\/cdp\/|apps\/chrome-extension\/src\/collectors\/|extension\/tests\/(fixture|unit\/migration)\/s32\/)/.test(
      p,
    ),
);
sources.push("packages/browser-runtime/src/collector-consent.ts");
for (const path of sources)
  assert.ok(
    readFileSync(path, "utf8").trimEnd().split("\n").length <= 199,
    `source size ${path}`,
  );
for (const [entry, pattern] of [
  [
    "packages/collector/src/advanced/index.ts",
    /^extension\/src\/|^apps\/|packages\/(provider-adapters|task-engine|browser-runtime|tool-runtime|policy-engine)/,
  ],
  [
    "packages/browser-runtime/src/index.ts",
    /^extension\/src\/|^apps\/|packages\/(provider-adapters|task-engine)/,
  ],
]) {
  const output = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: "browser",
    metafile: true,
  });
  assert.ok(
    Object.keys(output.metafile.inputs).every((p) => !pattern.test(p)),
    `authority import ${entry}`,
  );
}
for (const path of sources.filter((p) => p.includes("/cdp/")))
  assert.doesNotMatch(
    readFileSync(path, "utf8"),
    /Runtime\.evaluate|Network\.replayXHR|Network\.getRequestPostData|Debugger\.evaluateOnCallFrame/,
  );
console.log(
  JSON.stringify({
    result: "PASS",
    modules: sources.length,
    ...validateInventory(manifest),
    productionAndDesign: "unchanged",
  }),
);
