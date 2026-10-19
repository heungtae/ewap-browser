import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
import prettier from "prettier";
const built = await build({
  stdin: {
    contents: "export * from './src/bridge.ts'; export {z} from 'zod';",
    resolveDir: resolve("packages/shared"),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const schemas = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`
);
const golden = {};
for (const name of [
  "helloSchema",
  "envelopeSchema",
  "challengeSchema",
  "readySchema",
  "responseSchema",
  "transferCommandSchema",
  "replaySchema",
  "bridgeEventSchema",
])
  golden[name] = schemas.z.toJSONSchema(schemas[name]);
const text = await prettier.format(JSON.stringify(golden), { parser: "json" });
const path = "extension/tests/fixture/s28-contracts.json";
if (process.argv.includes("--update")) await writeFile(path, text);
else
  assert.equal(await readFile(path, "utf8"), text, "S28 contract golden drift");
console.log("S28 closed bridge schemas: 8 goldens PASS");
