import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
const inventory = JSON.parse(
  await readFile("dist-extension/method-trace-coverage.json", "utf8"),
);
const documented = new Set();
for (const doc of [
  "31-act-request-execution-current-implementation.md",
  "32-ask-act-analysis-data-acquisition-design.md",
  "33-ask-request-execution-current-implementation.md",
]) {
  const text = await readFile(`docs/${doc}`, "utf8");
  for (const file of text.matchAll(/[\w/-]+\.ts\b/g))
    documented.add(basename(file[0]));
}
const covered = new Set(
  inventory.methods.map(({ method }) => basename(method.split(":")[0])),
);
for (const file of documented)
  assert.ok(
    covered.has(file),
    `Documented execution module lacks method traces: ${file}`,
  );
assert.ok(inventory.methods.length > 1000);
console.log(
  `Method trace coverage PASS: ${documented.size} documented modules; ${inventory.methods.length} methods/callbacks in ${covered.size} runtime modules`,
);
