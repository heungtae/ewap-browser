import { readFile, writeFile } from "node:fs/promises";
import { cdp, evaluate, waitFor } from "../../chrome-cdp-utils.mjs";
export async function continuity({
  panel,
  browser,
  extensionId,
  port,
  output,
}) {
  const cases = [];
  for (const [name, path, width, height] of [
    ["panel-idle", "sidepanel/index.html", 390, 844],
    ["options-agent", "settings/index.html#agent", 1440, 1100],
    ["profile-manager", "settings/learned-profiles.html", 1100, 800],
  ]) {
    let target = panel;
    if (name !== "panel-idle") {
      const created = await cdp(
        browser.webSocketDebuggerUrl,
        "Target.createTarget",
        { url: `chrome-extension://${extensionId}/${path}` },
      );
      target = await waitFor(
        async () =>
          (
            await fetch(`http://127.0.0.1:${port}/json/list`).then((r) =>
              r.json(),
            )
          ).find((t) => t.id === created.targetId),
        5000,
        "UI_TARGET",
      );
    }
    await waitFor(
      () =>
        evaluate(target, "document.readyState==='complete' && !!document.body"),
      5000,
      "UI_READY",
    );
    await cdp(
      target.webSocketDebuggerUrl,
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile: false },
    );
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
    const old = new Map(
      baseline.elements.filter((e) => e.id).map((e) => [e.id, e]),
    );
    const current = new Map(
      data.elements.filter((e) => e.id).map((e) => [e.id, e]),
    );
    const missing = [...old.keys()].filter((id) => !current.has(id));
    const extra = [...current.keys()].filter((id) => !old.has(id));
    const changed = [...old.keys()].filter(
      (id) =>
        current.has(id) &&
        JSON.stringify(old.get(id)) !== JSON.stringify(current.get(id)),
    );
    const comparison = {
      name,
      viewportMatch:
        JSON.stringify(data.viewport) === JSON.stringify(baseline.viewport),
      fontMatch: data.font === baseline.font,
      missing,
      extra,
      changed,
      result:
        missing.length || extra.length || changed.length
          ? "DIFFERENT"
          : "MATCH",
      scope:
        "visible ID/geometry/role/state comparison only; no automatic acceptance",
    };
    cases.push(comparison);
    await writeFile(
      `${output}/${name}.json`,
      JSON.stringify({ comparison, observed: data }, null, 2) + "\n",
    );
    const { data: png } = await cdp(
      target.webSocketDebuggerUrl,
      "Page.captureScreenshot",
      { format: "png" },
    );
    await writeFile(`${output}/${name}.png`, Buffer.from(png, "base64"));
    if (name !== "panel-idle")
      await cdp(browser.webSocketDebuggerUrl, "Target.closeTarget", {
        targetId: target.id,
      });
  }
  return {
    result: "PARTIAL",
    cases,
    acceptance: "S36-C3 remains incomplete",
    unverified: [
      "workflow/approval/consent/dialog interactions",
      "manager operations",
      "full keyboard/window recovery",
      "installed target runtime history/settings continuity",
    ],
  };
}
