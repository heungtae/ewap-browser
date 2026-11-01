import assert from "node:assert/strict";
import { build } from "esbuild";
import { cdp, evaluate, waitFor } from "../chrome-cdp-utils.mjs";
// Exercises the ownership resolver with real Chrome sender/context data. The
// fixture injects issue() in the Worker; it does not simulate toolbar delivery.
export async function qualifyPanelOwner({ panel, worker, targets }) {
  const built = await build({
    entryPoints: ["apps/chrome-extension/src/bridge/panel-owner.ts"],
    bundle: true,
    write: false,
    format: "iife",
    globalName: "OwnerProbe",
    platform: "browser",
  });
  await evaluate(
    worker,
    built.outputFiles[0].text +
      ";globalThis.ownerProbe=new OwnerProbe.PanelOwners(chrome.runtime.id);true",
  );
  const tab = await evaluate(
    panel,
    "chrome.tabs.getCurrent().then(t=>({id:t.id,windowId:t.windowId}))",
  );
  const address = await evaluate(
    worker,
    `(()=>{const a=ownerProbe.issue(${JSON.stringify(tab)});globalThis.ownerAddress=a;return a.path})()`,
  );
  await evaluate(
    worker,
    `chrome.sidePanel.setOptions({tabId:${tab.id},path:${JSON.stringify(address)},enabled:true}).then(()=>true)`,
  );
  await evaluate(
    worker,
    `chrome.runtime.onMessage.addListener((v,s)=>{if(v?.kind==='ownerProbe')void ownerProbe.resolve(s,()=>chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}),id=>chrome.tabs.get(id)).then(o=>{globalThis.ownerResult={resolved:!!o,tabMatches:o?.tabId===${tab.id},windowMatches:o?.windowId===${tab.windowId},documentIdPresent:!!o?.documentId}})});true`,
  );
  await evaluate(
    panel,
    `(()=>{const b=document.createElement('button');b.style='position:fixed;left:0;top:0;z-index:2147483647';b.onclick=()=>chrome.sidePanel.open({tabId:${tab.id}});document.body.append(b);return true})()`,
  );
  for (const type of ["mousePressed", "mouseReleased"])
    await cdp(panel.webSocketDebuggerUrl, "Input.dispatchMouseEvent", {
      type,
      x: 15,
      y: 15,
      button: "left",
      clickCount: 1,
    });
  const owned = await waitFor(
    async () => (await targets()).find((t) => t.url.endsWith(address)),
    5000,
    "OWNED_PANEL",
  );
  await waitFor(
    () => evaluate(owned, "document.readyState==='complete'"),
    5000,
    "OWNED_PANEL_READY",
  );
  await evaluate(
    owned,
    "chrome.runtime.sendMessage({kind:'ownerProbe'}).then(()=>true)",
  );
  const result = await waitFor(
    () => evaluate(worker, "globalThis.ownerResult"),
    5000,
    "OWNER_RESOLVE",
  );
  assert.deepEqual(result, {
    resolved: true,
    tabMatches: true,
    windowMatches: true,
    documentIdPresent: true,
  });
  await evaluate(
    worker,
    `ownerProbe.revoke(${tab.id});globalThis.ownerResult=null;true`,
  );
  await evaluate(
    owned,
    "chrome.runtime.sendMessage({kind:'ownerProbe'}).then(()=>true)",
  );
  const revoked = await waitFor(
    () => evaluate(worker, "globalThis.ownerResult"),
    5000,
    "OWNER_REVOKED",
  );
  assert.equal(revoked.resolved, false);
  return {
    ownedAddressResolves: true,
    revokedAddressDenied: true,
    ownerScope:
      "injected issuance, real Chrome sender/context; toolbar activation unqualified",
  };
}
