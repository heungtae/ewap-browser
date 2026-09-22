import { cdp, sleep, waitFor } from "./chrome-cdp-utils.mjs";

export const openAnalysisPanel = async ({
  cdpPort,
  extensionId,
  fixtureTarget,
  version,
  worker,
}) => {
  await cdp(version.webSocketDebuggerUrl, "Target.activateTarget", {
    targetId: fixtureTarget.targetId,
  });
  await sleep(250);
  const activeWindow = await cdp(
    worker.webSocketDebuggerUrl,
    "Runtime.evaluate",
    {
      expression:
        "chrome.tabs.query({active:true,lastFocusedWindow:true}).then(tabs => tabs[0].windowId)",
      awaitPromise: true,
      returnByValue: true,
    },
  );
  const settingsTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    { url: `chrome-extension://${extensionId}/settings/index.html` },
  );
  const settings = await waitFor(
    async () => {
      const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
        (response) => response.json(),
      );
      return targets.find((target) => target.id === settingsTarget.targetId);
    },
    10_000,
    "Settings target was not created",
  );
  const opened = await cdp(settings.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: `chrome.sidePanel.open({windowId:${activeWindow.result.value}}).then(() => true)`,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (opened.result?.value !== true)
    throw new Error(`Side Panel did not open: ${JSON.stringify(opened)}`);
  await cdp(version.webSocketDebuggerUrl, "Target.closeTarget", {
    targetId: settingsTarget.targetId,
  });
  await waitFor(
    () =>
      cdp(worker.webSocketDebuggerUrl, "Runtime.evaluate", {
        expression:
          "chrome.runtime.getContexts({contextTypes:['SIDE_PANEL']}).then((items) => items.length === 1)",
        awaitPromise: true,
        returnByValue: true,
      }).then((result) => result.result?.value),
    10_000,
    "Chrome did not open a real Side Panel context",
  );
  const panel = await waitFor(
    async () => {
      const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
        (response) => response.json(),
      );
      return targets.find(
        (target) =>
          target.url ===
          `chrome-extension://${extensionId}/sidepanel/index.html`,
      );
    },
    10_000,
    "real Side Panel DevTools target was not created",
  );
  await sleep(500);
  const window = await cdp(panel.webSocketDebuggerUrl, "Runtime.evaluate", {
    expression: "chrome.windows.getCurrent().then(({id}) => id)",
    awaitPromise: true,
    returnByValue: true,
  });
  if (!Number.isInteger(window.result?.value) || window.result.value < 0)
    throw new Error("Side Panel has no authenticated window ID");
  return { panel, panelWindowId: window.result.value };
};
