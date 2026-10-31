import assert from "node:assert/strict";
import { cdp, evaluate, waitFor } from "../chrome-cdp-utils.mjs";

export async function qualifyMultiplePanels({
  panel,
  sidePanel,
  targets,
  worker,
}) {
  const previous = new Set((await targets()).map((target) => target.id));
  const secondWindow = await evaluate(
    panel,
    "chrome.windows.create({url:chrome.runtime.getURL('sidepanel/index.html'),type:'normal'}).then(w=>w.id)",
  );
  try {
    const secondTab = await waitFor(
      async () =>
        (await targets()).find(
          (target) => !previous.has(target.id) && target.url === panel.url,
        ),
      5000,
      "SECOND_UI_TARGET",
    );
    await waitFor(
      () =>
        evaluate(
          secondTab,
          "document.readyState === 'complete' && !!chrome.sidePanel",
        ),
      5000,
      "SECOND_UI_DOCUMENT",
    );
    const beforePanel = new Set((await targets()).map((target) => target.id));
    await evaluate(
      secondTab,
      `(()=>{const b=document.createElement('button');b.id='s28-multi-open';b.style='position:fixed;left:0;top:0;z-index:2147483647';b.textContent='test';b.onclick=()=>chrome.sidePanel.open({windowId:${Number(secondWindow)}}).then(()=>window.s28Multi='opened').catch(e=>window.s28Multi=String(e));document.body.append(b);return true})()`,
    );
    await cdp(secondTab.webSocketDebuggerUrl, "Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: 15,
      y: 15,
      button: "left",
      clickCount: 1,
    });
    await cdp(secondTab.webSocketDebuggerUrl, "Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: 15,
      y: 15,
      button: "left",
      clickCount: 1,
    });
    assert.equal(
      await waitFor(
        () => evaluate(secondTab, "window.s28Multi"),
        5000,
        "SECOND_PANEL_OPEN",
      ),
      "opened",
    );
    const secondPanel = await waitFor(
      async () =>
        (await targets()).find(
          (target) => !beforePanel.has(target.id) && target.url === panel.url,
        ),
      5000,
      "SECOND_PANEL_TARGET",
    );
    await waitFor(
      () => evaluate(secondPanel, "document.readyState === 'complete'"),
      5000,
      "SECOND_PANEL_DOCUMENT",
    );
    await waitFor(
      () =>
        evaluate(
          worker,
          "chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}).then(v=>v.length===2)",
        ),
      5000,
      "TWO_PANEL_CONTEXTS",
    );
    for (const target of [sidePanel, secondPanel]) {
      const response = await evaluate(
        target,
        "chrome.runtime.sendMessage({kind:'capabilities'})",
      );
      assert.equal(response?.ok, false, JSON.stringify(response));
    }
  } finally {
    await evaluate(
      panel,
      `chrome.windows.remove(${Number(secondWindow)}).then(()=>true)`,
    );
  }
  await waitFor(
    () =>
      evaluate(
        worker,
        "chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}).then(v=>v.length===1)",
      ),
    5000,
    "ONE_PANEL_CONTEXT",
  );
  const recovered = await evaluate(
    sidePanel,
    "chrome.runtime.sendMessage({kind:'capabilities'})",
  );
  assert.equal(recovered?.ok, true, JSON.stringify(recovered));
  return { multiplePanelsFailClosed: true, singlePanelRecovers: true };
}
