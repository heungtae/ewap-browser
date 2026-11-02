import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import { cdp, evaluate } from "../chrome-cdp-utils.mjs";
export async function capturePanel(
  target,
  output,
  name,
  reviewed = {},
  enforce = true,
) {
  await evaluate(
    target,
    "document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))",
  );
  const data = await evaluate(
    target,
    `(()=>({viewport:[innerWidth,innerHeight,devicePixelRatio],font:getComputedStyle(document.body).fontFamily,focus:document.activeElement?.id,elements:[...document.querySelectorAll('body *')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,id:e.id,role:e.getAttribute('role'),class:e.className,disabled:!!e.disabled,rect:[r.x,r.y,r.width,r.height].map(v=>Math.round(v*10)/10)}})}))()`,
  );
  const baseline = JSON.parse(
    await readFile(`docs/baselines/s26/ui/${name}.json`, "utf8"),
  );
  const before = new Map(
    baseline.elements.filter((e) => e.id).map((e) => [e.id, e]),
  );
  const after = new Map(
    data.elements.filter((e) => e.id).map((e) => [e.id, e]),
  );
  const comparison = {
    name,
    viewportMatch:
      JSON.stringify(data.viewport) === JSON.stringify(baseline.viewport),
    fontMatch: data.font === baseline.font,
    missing: [...before.keys()].filter((id) => !after.has(id)),
    extra: [...after.keys()].filter((id) => !before.has(id)),
    changed: [...before.keys()].filter(
      (id) =>
        after.has(id) &&
        JSON.stringify(before.get(id)) !== JSON.stringify(after.get(id)),
    ),
    scope:
      "observed visible ID/geometry/state differences, not automatic parity acceptance",
  };
  await writeFile(
    `${output}/${name}-observed.json`,
    JSON.stringify({ comparison, observed: data, baseline }, null, 2) + "\n",
  );
  assert.equal(comparison.viewportMatch, true, `${name}:viewport`);
  assert.equal(comparison.fontMatch, true, `${name}:font`);
  if (enforce) assert.deepEqual(comparison.missing, [], `${name}:missing`);
  if (enforce) assert.deepEqual(comparison.extra, [], `${name}:extra`);
  const allowed = {
    ...reviewed,
    "execution-trace": "bounded current UI status text",
    "diagnostics-debug": "vertical position follows status text height",
    "diagnostics-export": "vertical position follows status text height",
    "chat-send": "authoritative terminal event releases a stalled Stop control",
  };
  for (const id of enforce ? comparison.changed : [])
    assert.ok(id in allowed, `${name}:unreviewed difference:${id}`);
  comparison.acceptance = enforce
    ? "reviewed differences only"
    : "pending review; observation only";
  comparison.reviewedDifferences = Object.fromEntries(
    comparison.changed
      .filter((id) => id in allowed)
      .map((id) => [id, allowed[id]]),
  );
  await writeFile(
    `${output}/${name}.json`,
    JSON.stringify({ comparison, observed: data }, null, 2) + "\n",
  );
  const shot = await cdp(
    target.webSocketDebuggerUrl,
    "Page.captureScreenshot",
    { format: "png" },
  );
  await writeFile(`${output}/${name}.png`, Buffer.from(shot.data, "base64"));
  return comparison;
}
