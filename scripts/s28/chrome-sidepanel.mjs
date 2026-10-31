import assert from "node:assert/strict";
import { cdp, evaluate, waitFor } from "../chrome-cdp-utils.mjs";
export async function qualifySidePanel({ panel, targets, worker }) {
  const windowId = await evaluate(
    panel,
    "chrome.windows.getCurrent().then(w=>w.id)",
  );
  await evaluate(
    panel,
    `(()=>{const button=document.createElement('button');button.id='s28-open-panel-test';button.textContent='test';button.style='position:fixed;left:0;top:0;z-index:2147483647';button.onclick=()=>chrome.sidePanel.open({windowId:${Number(windowId)}}).then(()=>window.s28PanelOpen='opened').catch(e=>window.s28PanelOpen=String(e));document.body.append(button);return true})()`,
  );
  await cdp(panel.webSocketDebuggerUrl, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: 15,
    y: 15,
    button: "left",
    clickCount: 1,
  });
  await cdp(panel.webSocketDebuggerUrl, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: 15,
    y: 15,
    button: "left",
    clickCount: 1,
  });
  const opened = await waitFor(
    () => evaluate(panel, "window.s28PanelOpen"),
    5000,
    "SIDE_PANEL_OPEN",
  );
  assert.equal(opened, "opened");
  const sidePanel = await waitFor(
    async () =>
      (await targets()).find(
        (item) => item.id !== panel.id && item.url === panel.url,
      ),
    5000,
    "SIDE_PANEL_TARGET",
  );
  await waitFor(
    () => evaluate(sidePanel, "document.readyState === 'complete'"),
    5000,
    "SIDE_PANEL_DOCUMENT",
  );
  const sidePanelResponse = await evaluate(
    sidePanel,
    "chrome.runtime.sendMessage({kind:'capabilities'})",
  );
  assert.equal(sidePanelResponse?.ok, true, JSON.stringify(sidePanelResponse));
  const sidePanelReplay = await evaluate(
    sidePanel,
    "chrome.runtime.sendMessage({kind:'resumeEvents',afterSequence:0})",
  );
  assert.equal(sidePanelReplay?.ok, true, JSON.stringify(sidePanelReplay));
  const sidePanelMigration = await evaluate(
    sidePanel,
    "chrome.runtime.sendMessage({kind:'migration.status'})",
  );
  assert.equal(
    sidePanelMigration?.ok,
    false,
    JSON.stringify(sidePanelMigration),
  );
  const contexts = await evaluate(
    worker,
    "chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']})",
  );
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].windowId, -1);
  await evaluate(
    panel,
    "document.querySelector('#s28-open-panel-test')?.remove()",
  );
}
