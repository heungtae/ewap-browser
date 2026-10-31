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
  await evaluate(
    worker,
    `chrome.runtime.onConnect.addListener(p=>{if(p.name==='s28-context-probe'){const s=p.sender;void chrome.storage.session.set({s28PortProbe:{documentIdPresent:typeof s?.documentId==='string',tabPresent:!!s?.tab,originMatches:s?.origin==='chrome-extension://'+chrome.runtime.id}})}})`,
  );
  await evaluate(
    sidePanel,
    `(()=>{window.s28ProbePort=chrome.runtime.connect({name:'s28-context-probe'});return true})()`,
  );
  const portSender = await waitFor(
    () =>
      evaluate(
        worker,
        "chrome.storage.session.get('s28PortProbe').then(v=>v.s28PortProbe)",
      ),
    5000,
    "SIDE_PANEL_PORT_SENDER",
  );
  assert.deepEqual(portSender, {
    documentIdPresent: false,
    tabPresent: false,
    originMatches: true,
  });
  const selfWindowId = await evaluate(
    sidePanel,
    "chrome.windows.getCurrent().then(w=>w.id)",
  );
  assert.equal(selfWindowId, windowId);
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
  const filteredContexts = await evaluate(
    worker,
    `chrome.runtime.getContexts({contextTypes:['SIDE_PANEL'],windowIds:[${Number(windowId)}]}).then(items=>items.length)`,
  );
  assert.equal(filteredContexts, 0);
  await evaluate(
    panel,
    "document.querySelector('#s28-open-panel-test')?.remove()",
  );
  return {
    target: sidePanel,
    portSenderDocumentIdPresent: false,
    selfReportedWindowMatches: true,
    sidePanelWindowFilterCount: 0,
  };
}
