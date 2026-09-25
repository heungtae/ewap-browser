import { evaluate, waitFor } from "./chrome-cdp-utils.mjs";

export const checkS2Stop = async ({
  panel,
  page,
  tabId,
  preview,
  attached,
}) => {
  const refId = preview.snapshot.nodes.find(
    (node) => node.name === "Slow action",
  )?.ref_id;
  if (!refId) throw new Error("S2_STOP_TARGET_MISSING");
  const started = await evaluate(
    panel,
    `(() => {
      window.__s2SlowResult = chrome.runtime.sendMessage(${JSON.stringify({
        kind: "START_ACT",
        tool: "click_by_ref",
        ref_id: refId,
      })});
      return true;
    })()`,
  );
  if (started !== true) throw new Error("S2_STOP_ACTION_NOT_STARTED");
  await waitFor(
    () => attached(panel, tabId),
    5_000,
    "S2_STOP_ACTION_NOT_ATTACHED",
  );
  const cancelled = await evaluate(
    panel,
    "chrome.runtime.sendMessage({kind:'CANCEL'})",
  );
  if (cancelled?.outcome !== "CANCELLED")
    throw new Error(`S2_STOP_FAILED: ${cancelled?.code}`);
  await waitFor(
    async () => {
      const marker = await evaluate(
        panel,
        `chrome.storage.session.get('contextpilot_cdp_marker_${tabId}')`,
      );
      return (
        !(await attached(panel, tabId)) &&
        marker?.[`contextpilot_cdp_marker_${tabId}`] === null
      );
    },
    10_000,
    "S2_STOP_DETACH_LEAK",
  );
  const count = await evaluate(page, "window.s2SlowCount ?? 0");
  if (count > 1) throw new Error("S2_STOP_RETRIED_INPUT");
};
