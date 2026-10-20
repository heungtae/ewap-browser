import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import prettier from "prettier";
const output = await build({
  stdin: {
    contents:
      "export * from './packages/tool-registry/src/index.ts';export {z} from './packages/tool-registry/node_modules/zod/index.js';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const m = await import(
  `data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`
);
const contracts = {};
for (const tool of m.toolIds)
  contracts[tool] = {
    wireName: m.wireName(tool),
    inputSchema: m.z.toJSONSchema(m.inputSchemas[tool]),
  };
for (const name of [
  "preparedSchema",
  "receiptSchema",
  "promptSchema",
  "approvalSchema",
  "responseSchema",
])
  contracts[name] = m.z.toJSONSchema(m[name]);
const path = "extension/tests/fixture/s30/contracts.json";
const text = await prettier.format(JSON.stringify(contracts), {
  parser: "json",
});
if (process.argv.includes("--update")) await writeFile(path, text);
else assert.equal(await readFile(path, "utf8"), text, "S30 schema drift");
console.log("S30 21 tool + 5 execution/approval schema goldens PASS");
