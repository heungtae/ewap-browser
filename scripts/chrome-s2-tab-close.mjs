import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";

export const checkS2TabClose = async ({ panel, fixturePort, version }) => {
  const page = await cdp(version.webSocketDebuggerUrl, "Target.createTarget", {
    url: `https://s1.fixture.test:${fixturePort}/close-test`,
  });
  const tabId = await waitFor(
    () =>
      evaluate(
        panel,
        `chrome.tabs.query({}).then(tabs => tabs.find(tab => tab.url?.endsWith('/close-test'))?.id)`,
      ),
    10_000,
    "S2_CLOSE_TAB_MISSING",
  );
  const markerKey = `contextpilot_cdp_marker_${tabId}`;
  const attached = await evaluate(
    panel,
    `(async () => {
      await chrome.debugger.attach({tabId:${tabId}}, '1.3');
      await chrome.storage.session.set({${JSON.stringify(markerKey)}:{
        tabId:${tabId}, runId:'s2-close', actionId:'s2-close', phase:'attached'
      }});
      return true;
    })()`,
  );
  if (attached !== true) throw new Error("S2_CLOSE_ATTACH_FAILED");
  await cdp(version.webSocketDebuggerUrl, "Target.closeTarget", {
    targetId: page.targetId,
  });
  await waitFor(
    async () => {
      const stored = await evaluate(
        panel,
        `chrome.storage.session.get(${JSON.stringify(markerKey)})`,
      );
      return stored?.[markerKey] === null;
    },
    10_000,
    "S2_TAB_CLOSE_MARKER_LEAK",
  );
};
