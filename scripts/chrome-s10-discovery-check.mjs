import assert from "node:assert/strict";
import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";

export const checkS10Discovery = async ({
  panel,
  panelWindowId,
  page,
  worker,
  version,
  cdpPort,
  fixtureRequests,
}) => {
  const send = (payload) =>
    evaluate(
      panel,
      `chrome.runtime.sendMessage(${JSON.stringify({ kind: "PANEL_REQUEST", window_id: panelWindowId, payload })})`,
    );
  const discover = () => send({ kind: "PAGE_API_DISCOVERY_START" });
  const storageBefore = await evaluate(panel, "chrome.storage.local.get(null)");
  const networkBaseline = fixtureRequests.length;
  await evaluate(
    page,
    `(() => {
    window.s10GetterCalls=0;window.s10FunctionCalls=0;window.s10ProxyTraps=0;
    Object.defineProperty(window.gridApi,'secretAccessor',{get(){s10GetterCalls++;throw Error('S10_SECRET_GETTER');},configurable:true});
    window.gridApi.neverInvoke=()=>{s10FunctionCalls++;throw Error('S10_SECRET_FUNCTION');};
    window.chartManager=new Proxy({},{ownKeys(){s10ProxyTraps++;throw Error('S10_SECRET_PROXY');}});
    localStorage.setItem('S10_SECRET_STORAGE','S10_SECRET_VALUE');
    return true;
  })()`,
  );
  const safe = await discover();
  assert.equal(safe.result.terminal, "COMPLETED");
  assert.equal(JSON.stringify(safe).includes("S10_SECRET_"), false);
  assert.deepEqual(
    await evaluate(
      page,
      "({getter:s10GetterCalls,functions:s10FunctionCalls,proxy:s10ProxyTraps})",
    ),
    { getter: 0, functions: 0, proxy: 1 },
  );
  assert.equal(
    fixtureRequests.length,
    networkBaseline,
    "scanner fetched an endpoint or external script",
  );
  await evaluate(
    panel,
    "document.querySelector('#page-api-discovery').click();document.querySelector('#discovery-scan').click()",
  );
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelectorAll('#discovery-candidates li').length > 0",
      ),
    10000,
    "review dialog lacks candidates",
  );
  await evaluate(
    panel,
    "document.querySelector('#discovery-candidates button').click()",
  );
  assert.equal(
    await evaluate(
      panel,
      "document.querySelector('#discovery-candidates button').textContent",
    ),
    "검토 필요로 표시됨",
  );
  const dialogText = await evaluate(
    panel,
    "document.querySelector('#discovery-dialog').textContent",
  );
  for (const secret of [
    "S10_SECRET_",
    "demoControls",
    "fixture-api",
    "privateBackdoor",
  ])
    assert.equal(dialogText.includes(secret), false);
  assert.deepEqual(
    await evaluate(panel, "chrome.storage.local.get(null)"),
    storageBefore,
    "review created persistent state",
  );
  await evaluate(panel, "document.querySelector('#discovery-close').click()");
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('#discovery-candidates').children.length === 0",
      ),
    10000,
    "closing dialog kept candidates",
  );
  await evaluate(
    panel,
    "document.querySelector('#page-api-discovery').click();document.querySelector('#discovery-scan').click()",
  );
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelectorAll('#discovery-candidates li').length > 0",
      ),
    10000,
    "tab-switch dialog lacks candidates",
  );
  const alternate = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    { url: "about:blank" },
  );
  await cdp(version.webSocketDebuggerUrl, "Target.activateTarget", {
    targetId: alternate.targetId,
  });
  await waitFor(
    () =>
      evaluate(
        panel,
        "!document.querySelector('#discovery-dialog').open && document.querySelector('#discovery-candidates').children.length === 0",
      ),
    10000,
    "tab activation kept review candidates",
  );
  await cdp(version.webSocketDebuggerUrl, "Target.activateTarget", {
    targetId: page.id,
  });
  await cdp(version.webSocketDebuggerUrl, "Target.closeTarget", {
    targetId: alternate.targetId,
  });
  // A slow hostile reflection can outlive Stop; the terminal has no candidates.
  const slow = () =>
    evaluate(
      page,
      `window.chartManager=new Proxy({},{ownKeys(){const until=Date.now()+1500;while(Date.now()<until){};return [];}});true`,
    );
  await slow();
  await evaluate(
    panel,
    `window.s10Pending=chrome.runtime.sendMessage(${JSON.stringify({ kind: "PANEL_REQUEST", window_id: panelWindowId, payload: { kind: "PAGE_API_DISCOVERY_START" } })});true`,
  );
  await send({ kind: "PAGE_API_DISCOVERY_STOP" });
  const stopped = await evaluate(panel, "s10Pending");
  assert.equal(stopped.result.candidates.length, 0);
  assert.ok(
    ["CANCELLED", "MAIN_UNRESPONSIVE"].includes(stopped.result.terminal),
  );
  await waitFor(
    () => evaluate(page, "document.readyState === 'complete'"),
    5000,
    "renderer did not return",
  );
  const timed = await discover();
  assert.equal(timed.result.terminal, "MAIN_UNRESPONSIVE");
  assert.equal(timed.result.candidates.length, 0);
  // UI close during a pending request discards late responses.
  await waitFor(
    () => evaluate(page, "document.readyState === 'complete'"),
    5000,
    "renderer did not return",
  );
  await evaluate(
    panel,
    "document.querySelector('#page-api-discovery').click();document.querySelector('#discovery-scan').click();document.querySelector('#discovery-close').click()",
  );
  await new Promise((resolve) => setTimeout(resolve, 1700));
  assert.equal(
    await evaluate(
      panel,
      "document.querySelector('#discovery-candidates').children.length",
    ),
    0,
  );
  await evaluate(
    page,
    "delete window.chartManager;history.pushState({},'',location.pathname+'?new-scope');true",
  );
  await send({ kind: "PAGE_SNAPSHOT_PREVIEW", scope: "all_dom" }).catch(
    () => undefined,
  );
  const newScope = await discover();
  assert.equal(newScope.result.terminal, "COMPLETED");
  await evaluate(
    panel,
    "document.querySelector('#page-api-discovery').click();document.querySelector('#discovery-scan').click()",
  );
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelectorAll('#discovery-candidates li').length > 0",
      ),
    10000,
    "new-scope dialog lacks candidates",
  );
  await cdp(page.webSocketDebuggerUrl, "Page.navigate", {
    url: page.url.replace(/\?.*$/, "") + "?new-document",
  });
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('#discovery-candidates').children.length === 0",
      ),
    10000,
    "navigation kept old candidates",
  );
  await evaluate(panel, "document.querySelector('#discovery-close').click()");
  await cdp(version.webSocketDebuggerUrl, "Target.closeTarget", {
    targetId: worker.id,
  });
  const restarted = await waitFor(
    async () => {
      const result = await discover().catch(() => undefined);
      return result?.result?.terminal === "COMPLETED" ? result : undefined;
    },
    10000,
    "fresh explicit scan after worker restart failed",
  );
  assert.ok(restarted.result.candidates.length > 0);
  const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
    (r) => r.json(),
  );
  assert.ok(
    targets.some(
      (target) => target.type === "service_worker" && target.id !== worker.id,
    ),
  );
  const exported = await send({
    schema_version: 1,
    kind: "DIAGNOSTICS_BUNDLE_EXPORT",
  });
  for (const value of [
    exported,
    await evaluate(panel, "chrome.storage.local.get(null)"),
  ])
    assert.equal(JSON.stringify(value).includes("S10_SECRET_"), false);
  console.log(
    "S10 Discovery matrix passed: getter/Proxy, no invocation/network/storage, review/close, Stop/timeout, navigation and worker restart",
  );
};
