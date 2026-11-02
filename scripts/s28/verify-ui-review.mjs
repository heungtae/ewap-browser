import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const [nativePath, panelPath] = process.argv.slice(2);
const read = async (p) => JSON.parse(await readFile(p, "utf8"));
const native = await read(nativePath),
  panel = await read(panelPath);
assert.equal(native.result, "PASS");
assert.equal(panel.result, "PASS");
assert.equal(native.native.preferences.baselineReviewPending, false);
const settings = [
  ...native.native.preferences.comparisons,
  ...native.native.advisoryManagement.baselineComparisons,
];
assert.equal(settings.length, 6);
for (const entry of settings)
  assert.equal(
    entry.acceptance,
    "reviewed S26 differences; exact current geometry enforced",
  );
for (const entry of panel.cases)
  assert.equal(entry.acceptance, "reviewed differences only");
const cases = [...settings, ...panel.cases];
assert.equal(cases.length, 26);
for (const entry of cases) {
  assert.equal(entry.viewportMatch, true);
  assert.equal(entry.fontMatch, true);
}
const expected = (await read("docs/baselines/s26/ui/report.json")).captures
  .map((c) => c.name)
  .sort();
assert.deepEqual(cases.map((c) => c.name).sort(), expected);
console.log(
  JSON.stringify({
    result: "PASS",
    recordedS26States: expected.length,
    settingsStates: settings.length,
    panelStates: panel.cases.length,
    names: expected,
  }),
);
