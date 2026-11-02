import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { capturePanel } from "./chrome-panel-capture.mjs";
// Record mode cannot establish acceptance. Review records pin exact current geometry
// and explain the differences from the untouched S26 baseline.
export async function captureSettings(target, output, name) {
  const comparison = await capturePanel(target, output, name, {}, false);
  const { observed, baseline } = JSON.parse(
    await readFile(`${output}/${name}-observed.json`, "utf8"),
  );
  const byId = (data) =>
    Object.fromEntries(data.elements.filter((e) => e.id).map((e) => [e.id, e]));
  const before = byId(baseline),
    after = byId(observed);
  const shape = (data) => {
    const result = {};
    for (const e of data.elements) {
      const key = JSON.stringify([e.tag, e.id, e.role, e.class]);
      result[key] = (result[key] ?? 0) + 1;
    }
    return result;
  };
  const oldShape = shape(baseline),
    newShape = shape(observed);
  for (const key of new Set([
    ...Object.keys(oldShape),
    ...Object.keys(newShape),
  ]))
    if ((oldShape[key] ?? 0) !== (newShape[key] ?? 0))
      assert.equal(
        JSON.parse(key)[0],
        "OUTPUT",
        `${name}: unexpected visible DOM structure ${key}`,
      );

  const delta = {
    viewport: observed.viewport,
    font: observed.font,
    missing: comparison.missing,
    extra: comparison.extra,
    changes: Object.fromEntries(
      comparison.changed.map((id) => [
        id,
        { before: before[id], after: after[id] },
      ]),
    ),
  };
  if (process.env.S28_RECORD_UI_REVIEW === "1")
    return { ...comparison, acceptance: "recorded; pending review" };
  const review = JSON.parse(
    await readFile("docs/baselines/s28/ui-review.json", "utf8"),
  );
  const approved = review.states[name];
  assert.ok(approved?.reason, `${name}: missing explicit review`);
  assert.equal(
    createHash("sha256")
      .update(await readFile(`docs/baselines/s26/ui/${name}.json`))
      .digest("hex"),
    approved.baselineSha256,
    `${name}: S26 baseline changed`,
  );
  assert.deepEqual(
    delta,
    approved.delta,
    `${name}: unreviewed baseline difference`,
  );
  return {
    ...comparison,
    acceptance: "reviewed S26 differences; exact current geometry enforced",
    review: approved.reason,
  };
}
