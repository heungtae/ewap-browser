import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadS27 } from "./bundle.mjs";
import { format } from "prettier";
const { module: s27 } = await loadS27();
const directory = "extension/tests/fixture/s27-contracts";
const schemas = {
  "decision-frame": s27.jsonSchemas.frame,
  "decision-result": s27.decisionResultJsonSchema,
  "argument-binding": s27.argumentBindingJsonSchema,
  "plan-revision": s27.planRevisionJsonSchema,
  "native-response": s27.nativeResponseJsonSchema,
};
if (process.argv.includes("--update"))
  await mkdir(directory, { recursive: true });
for (const [name, schema] of Object.entries(schemas)) {
  const path = `${directory}/${name}.schema.json`,
    text = await format(JSON.stringify(schema), { parser: "json" });
  if (process.argv.includes("--update")) await writeFile(path, text);
  else if ((await readFile(path, "utf8")) !== text)
    throw new Error(`SCHEMA_GOLDEN_CHANGED: ${path}`);
}
console.log(
  `S27 schema exports ${process.argv.includes("--update") ? "written" : "match"} (${Object.keys(schemas).length})`,
);
