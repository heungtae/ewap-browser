import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { cdp, evaluate } from "./chrome-cdp-utils.mjs";
import { digest } from "./s26-inventory.mjs";

export const output = "docs/baselines/s26/ui";
export const captures = [];
export async function capture(target, name, width = 390, height = 844) {
  await mkdir(output, { recursive: true });
  await cdp(target.webSocketDebuggerUrl, "Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await evaluate(
    target,
    "document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))",
  );
  const project = `(()=>({viewport:[innerWidth,innerHeight,devicePixelRatio],font:getComputedStyle(document.body).fontFamily,focus:document.activeElement?.id,elements:[...document.querySelectorAll('body *')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {tag:e.tagName,id:e.id,role:e.getAttribute('role'),class:e.className,disabled:!!e.disabled,rect:[r.x,r.y,r.width,r.height].map(v=>Math.round(v*10)/10)}})}))()`;
  const first = await evaluate(target, project);
  const second = await evaluate(target, project);
  assert.ok(first?.elements.length > 0, name);
  assert.deepEqual(second, first, `${name}: unstable DOM/focus/layout`);
  const shot = await cdp(
    target.webSocketDebuggerUrl,
    "Page.captureScreenshot",
    { format: "png" },
  );
  const png = Buffer.from(shot.data, "base64");
  await writeFile(`${output}/${name}.png`, png);
  await writeFile(
    `${output}/${name}.json`,
    JSON.stringify(first, null, 2) + "\n",
  );
  captures.push({
    name,
    viewport: first.viewport,
    font: first.font,
    png_sha256: digest(png),
    structure_sha256: digest(JSON.stringify(first)),
    comparison: "two stable DOM/focus/layout samples; screenshot recorded",
  });
}
