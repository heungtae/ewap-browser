import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  instrumentMethodSource,
  isTraceSource,
} from "./method-trace-instrumentation.mjs";

const inventory = JSON.parse(
  await readFile("dist-extension/method-trace-coverage.json", "utf8"),
);
// Derive expected methods from the current entry points and their bundled code.
const { metafile } = await build({
  entryPoints: [
    "extension/src/service-worker/entry.ts",
    "extension/src/content/entry.ts",
    "extension/src/sidepanel/entry.ts",
    "extension/src/settings/entry.ts",
    "extension/src/offscreen/entry.ts",
  ],
  bundle: true,
  format: "esm",
  target: "chrome106",
  outdir: "dist-extension/js",
  write: false,
  metafile: true,
});
const expected = [];
for (const file of Object.keys(metafile.inputs)) {
  if (!isTraceSource(resolve(file))) continue;
  expected.push(
    ...instrumentMethodSource(await readFile(file, "utf8"), resolve(file))
      .inventory,
  );
}
const sorted = (methods) =>
  methods
    .map(({ method, kind, line }) => ({ method, kind, line }))
    .sort((a, b) => a.method.localeCompare(b.method));
assert.ok(expected.length > 0, "No traceable bundled methods found");
assert.deepEqual(
  sorted(inventory.methods),
  sorted(expected),
  "Built method traces differ from current bundled source; rebuild the extension",
);
const covered = new Set(expected.map(({ method }) => method.split(":")[0]));
console.log(
  `Method trace coverage PASS: ${expected.length} methods/callbacks match current source in ${covered.size} runtime modules`,
);
