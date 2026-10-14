import assert from "node:assert/strict";
import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";

export async function openLearnedProfileManager(settings, harness) {
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#learned-profile-open') !== null",
      ),
    10000,
    "MANAGER_BUTTON_READY",
  );
  assert.equal(
    await evaluate(
      settings,
      "document.querySelector('#learned-profiles') === null",
    ),
    true,
  );
  await evaluate(
    settings,
    "document.querySelector('#learned-profile-open').click()",
  );
  const url = `chrome-extension://${new URL(settings.url).host}/settings/learned-profiles.html`;
  const port = new URL(harness.version.webSocketDebuggerUrl).port;
  const targets = () =>
    fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const manager = await waitFor(
    async () => (await targets()).find((t) => t.url === url),
    10000,
    "MANAGER_WINDOW_READY",
  );
  await waitFor(
    () =>
      evaluate(
        manager,
        "document.querySelectorAll('.learned-profile-row').length === 1 && !!document.querySelector('#learned-profile-json')",
      ),
    10000,
    "MANAGER_LIST_READY",
  );
  const windows = await evaluate(
    settings,
    `chrome.tabs.query({url:${JSON.stringify(url)}}).then(async tabs => ({manager:await chrome.windows.get(tabs[0].windowId),settings:await chrome.windows.getCurrent()}))`,
  );
  assert.equal(windows.manager.type, "popup");
  assert.notEqual(windows.manager.id, windows.settings.id);
  await waitFor(
    () =>
      evaluate(
        settings,
        "!document.querySelector('#learned-profile-open').disabled",
      ),
    10000,
    "MANAGER_OPEN_COMPLETE",
  );
  await evaluate(
    settings,
    "document.querySelector('#learned-profile-open').click()",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "!document.querySelector('#learned-profile-open').disabled",
      ),
    10000,
    "MANAGER_REOPEN_COMPLETE",
  );
  assert.equal((await targets()).filter((t) => t.url === url).length, 1);
  assert.equal(
    await evaluate(
      manager,
      "getComputedStyle(document.querySelector('.learned-profile-controls')).gap",
    ),
    "14px",
  );
  assert.equal(
    await evaluate(
      manager,
      "document.querySelector('.learned-profile-row').getAttribute('aria-pressed')",
    ),
    "true",
  );
  const send = (message) =>
    evaluate(
      manager,
      `chrome.runtime.sendMessage(${JSON.stringify({ kind: "LEARNED_PROFILE_MANAGE", ...message })})`,
    );
  const catalog = await send({ operation: "list" });
  assert.equal(catalog.ok, true);
  assert.equal(
    (
      await evaluate(
        manager,
        "chrome.runtime.sendMessage({kind:'PERMISSION_REVOKE_ALL'})",
      )
    )?.ok,
    false,
  );
  return manager;
}
