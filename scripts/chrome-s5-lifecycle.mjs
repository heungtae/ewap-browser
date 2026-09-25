import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";

export const checkS5Lifecycle = async ({
  panel,
  panelWindowId,
  fixtureData,
  targets,
  version,
  extensionId,
}) => {
  fixtureData.setHold(true);
  await evaluate(
    panel,
    "(() => {document.querySelector('#chat-input').value='S5 panel reopen held';document.querySelector('#chat-form').requestSubmit();return true})()",
  );
  await waitFor(
    async () => {
      const visible = await evaluate(
        panel,
        "document.querySelector('#chat-messages')?.textContent.includes('S3 partial stop')",
      );
      if (visible) return true;
      if (fixtureData.captures.length > 1) return false;
      return false;
    },
    10_000,
    "S5_HELD_STREAM_NOT_VISIBLE",
  ).catch(async () => {
    const state = await evaluate(
      panel,
      "({status:document.querySelector('#status')?.textContent,button:document.querySelector('#chat-send')?.dataset.state,text:document.querySelector('#chat-messages')?.textContent.slice(-200)})",
    );
    throw new Error(
      `S5_HELD_STREAM_NOT_VISIBLE_${JSON.stringify({ state, captures: fixtureData.captures.length })}`,
    );
  });
  const closedPanelId = panel.id;
  const closed = await cdp(version.webSocketDebuggerUrl, "Target.closeTarget", {
    targetId: closedPanelId,
  });
  if (!closed.success) throw new Error("S5_PANEL_CLOSE_REJECTED");
  await waitFor(
    async () => !(await targets()).some((item) => item.id === closedPanelId),
    5_000,
    "S5_PANEL_TARGET_STILL_OPEN",
  );
  const settingsTarget = await cdp(
    version.webSocketDebuggerUrl,
    "Target.createTarget",
    { url: `chrome-extension://${extensionId}/settings/index.html` },
  );
  const settings = await waitFor(
    async () =>
      (await targets()).find((item) => item.id === settingsTarget.targetId),
    10_000,
    "S5_REOPEN_SETTINGS_NOT_READY",
  );
  const reopened = await cdp(
    settings.webSocketDebuggerUrl,
    "Runtime.evaluate",
    {
      expression: `chrome.sidePanel.open({windowId:${panelWindowId}}).then(() => true)`,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    },
  );
  if (reopened.result?.value !== true)
    throw new Error("S5_PANEL_REOPEN_FAILED");
  await cdp(version.webSocketDebuggerUrl, "Target.closeTarget", {
    targetId: settingsTarget.targetId,
  });
  panel = await waitFor(
    async () =>
      (await targets()).find(
        (item) =>
          item.url ===
            `chrome-extension://${extensionId}/sidepanel/index.html` &&
          item.id !== closedPanelId,
      ),
    10_000,
    "S5_REOPENED_PANEL_NOT_FOUND",
  ).catch(async () => {
    throw new Error(
      `S5_REOPENED_PANEL_NOT_FOUND_${JSON.stringify((await targets()).map((item) => ({ id: item.id, type: item.type, url: item.url })))}`,
    );
  });
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('#chat-messages')?.textContent.includes('S3 partial stop') || document.querySelector('.event-card[data-kind=error]') !== null",
      ),
    10_000,
    "S5_REOPEN_LOST_ACTIVE_RUN",
  );
  const reopenedState = await evaluate(
    panel,
    "({partial:document.querySelector('#chat-messages')?.textContent.includes('S3 partial stop'),error:document.querySelector('.event-card[data-kind=error]') !== null,button:document.querySelector('#chat-send')?.dataset.state})",
  );
  const recovery =
    reopenedState.partial && reopenedState.button === "stop"
      ? "restored-active"
      : reopenedState.error
        ? "explicit-failure"
        : undefined;
  if (!recovery)
    throw new Error(`S5_REOPEN_STATE_UNCLEAR_${JSON.stringify(reopenedState)}`);
  if (recovery === "restored-active")
    await evaluate(panel, "document.querySelector('#chat-send').click()");
  await waitFor(
    () => fixtureData.wasAborted(),
    10_000,
    "S5_REOPEN_STOP_FAILED",
  );
  fixtureData.setHold(false);
  return { panel, recovery };
};
