import assert from "node:assert/strict";
import { evaluate, waitFor } from "../chrome-cdp-utils.mjs";
// Triggers Chrome's toolbar action, rather than injecting address issuance.
export async function qualifyPanelOwner({ worker, targets, browserCommand }) {
  const tab = await evaluate(
    worker,
    "chrome.tabs.create({url:'about:blank#s28-owner',active:true}).then(t=>({id:t.id,windowId:t.windowId}))",
  );
  const target = await waitFor(
    async () =>
      (await targets()).find((t) => t.url === "about:blank#s28-owner"),
    5000,
    "OWNER_TAB",
  );
  const extensionId = new URL(worker.url).host;
  await browserCommand("Extensions.triggerAction", {
    id: extensionId,
    targetId: (
      await browserCommand("Target.getTargets", { filter: [{ type: "tab" }] })
    ).targetInfos.find((t) => t.url === target.url).targetId,
  });
  const address = await waitFor(
    async () => {
      const result = await evaluate(
        worker,
        `chrome.sidePanel.getOptions({tabId:${tab.id}}).then(o=>o.path)`,
      );
      return result?.includes("?owner=") ? result : undefined;
    },
    5000,
    "TOOLBAR_ADDRESS",
  );
  const owned = await waitFor(
    async () => (await targets()).find((t) => t.url.endsWith(address)),
    5000,
    "TOOLBAR_PANEL",
  );
  const response = await waitFor(
    async () => {
      const value = await evaluate(
        owned,
        "chrome.runtime.sendMessage({kind:'capabilities'})",
      );
      return value?.ok ? value : undefined;
    },
    7000,
    "TOOLBAR_CAPABILITIES",
  );
  assert.equal(response.result.taskReady, false);
  const contexts = await evaluate(
    worker,
    `chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}).then(cs=>cs.filter(c=>c.documentUrl.endsWith(${JSON.stringify(address)})))`,
  );
  assert.equal(contexts.length, 1);
  assert.ok(contexts[0].documentId);
  // An ordinary tab loading the same address cannot impersonate the panel.
  const copy = await evaluate(
    worker,
    `chrome.tabs.create({url:chrome.runtime.getURL(${JSON.stringify(address)}),active:false}).then(t=>t.id)`,
  );
  const copied = await waitFor(
    async () =>
      (await targets()).find(
        (t) =>
          t.type === "page" && t.id !== owned.id && t.url.endsWith(address),
      ),
    5000,
    "COPIED_OWNER",
  );
  const denied = await evaluate(
    copied,
    "chrome.runtime.sendMessage({kind:'capabilities'})",
  );
  assert.equal(denied?.ok, false);
  await evaluate(worker, `chrome.tabs.remove(${copy}).then(()=>true)`);
  return {
    toolbarActionOpenedPanel: true,
    ownedAddressResolves: true,
    copiedTabDenied: true,
    ownerScope:
      "Chrome toolbar action, live native bootstrap, tab impersonation; no task admission",
  };
}
