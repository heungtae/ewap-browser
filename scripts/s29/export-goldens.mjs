import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import prettier from "prettier";
const bundled = await build({
  stdin: {
    contents:
      "export * from './packages/codebase-schema/src/index.ts';export * from './packages/codebase-builder/src/index.ts';export * from './extension/tests/unit/migration/s29/support.ts';export {z} from './packages/codebase-schema/node_modules/zod/index.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const m = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);
const schemas = {};
for (const name of [
  "batchSchema",
  "deltaSchema",
  "snapshotSchema",
  "datasetSchema",
  "querySchema",
  "advisoryRecordSchema",
])
  schemas[name] = m.z.toJSONSchema(m[name]);
const sample = await m.batch([
  m.observation({
    evidenceId: "ev_form",
    kind: "form",
    control: null,
    role: "form",
    name: "Search",
  }),
  m.observation({ parentEvidenceId: "ev_form" }),
]);
for (const [path, value] of [
  ["extension/tests/fixture/s29/contracts.json", schemas],
  [
    "extension/tests/fixture/s29/observation-to-graph.json",
    { observation: sample, graph: await m.buildGraph(sample) },
  ],
]) {
  const text = await prettier.format(JSON.stringify(value), { parser: "json" });
  if (process.argv.includes("--update")) await writeFile(path, text);
  else
    assert.equal(
      await readFile(path, "utf8"),
      text,
      `S29 golden drift ${path}`,
    );
}
console.log("S29 six schema goldens + observation-to-graph golden PASS");
