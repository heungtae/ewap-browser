import { tabFrom } from "./settings-focus.mjs";
import assert from "node:assert/strict";
import { cdp, evaluate, waitFor } from "../chrome-cdp-utils.mjs";
import { captureSettings } from "./settings-capture.mjs";
export async function qualifyPreferences({ worker, panel, targets, output }) {
  const tabId = await evaluate(
    worker,
    "chrome.tabs.create({url:chrome.runtime.getURL('settings/index.html#agent'),active:true}).then(t=>t.id)",
  );
  const target = await waitFor(
    async () =>
      (await targets()).find((t) =>
        t.url.endsWith("/settings/index.html#agent"),
      ),
    5000,
    "PREFERENCES_TARGET",
  );
  const ready = () =>
    waitFor(
      () =>
        evaluate(
          target,
          "document.querySelectorAll('#approval-categories select').length===8 && !!document.querySelector('#agent-preferences-form button:not(:disabled)')",
        ),
      5000,
      "PREFERENCES_READY",
    );
  await ready();
  await cdp(target.webSocketDebuggerUrl, "Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const before = await evaluate(
    target,
    "chrome.runtime.sendMessage({kind:'settings.read'}).then(r=>r.result.state)",
  );
  await evaluate(
    target,
    "(()=>{const f=document.querySelector('#agent-preferences-form'), m=f.elements.namedItem('approval_mode');m.value='custom';m.dispatchEvent(new Event('change',{bubbles:true}));return true})()",
  );
  assert.equal(
    await evaluate(
      target,
      "document.querySelector('#approval-categories').hidden",
    ),
    false,
  );
  assert.equal(
    await evaluate(
      target,
      "document.querySelectorAll('#approval-categories select').length",
    ),
    8,
  );
  await evaluate(
    target,
    "document.querySelector('#agent-preferences-form').requestSubmit();true",
  );
  await waitFor(
    () =>
      evaluate(
        target,
        "document.querySelector('#agent-preferences-status').value.includes('저장했습니다')",
      ),
    5000,
    "PREFERENCES_SAVED",
  );
  const saved = await evaluate(
    target,
    "chrome.runtime.sendMessage({kind:'settings.read'}).then(r=>r.result.state)",
  );
  assert.equal(saved.revision, before.revision + 1);
  assert.equal(saved.preferences.approval_policy.mode, "custom");
  assert.equal(saved.preferences.approval_policy.revision, saved.revision);
  assert.equal(saved.controllerReady, false);
  const denied = await evaluate(
    panel,
    `chrome.runtime.sendMessage({kind:'settings.preferences.write', revision:${saved.revision}, preferences:${JSON.stringify(saved.preferences)}})`,
  );
  assert.equal(denied.ok, false);
  await cdp(target.webSocketDebuggerUrl, "Page.reload");
  await ready();
  assert.equal(
    await evaluate(
      target,
      "document.querySelector('[name=approval_mode]').value",
    ),
    "custom",
  );
  await cdp(target.webSocketDebuggerUrl, "Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const comparisons = [];
  for (const section of ["agent", "models", "automation", "enterprise"]) {
    await evaluate(target, `location.hash=${JSON.stringify(section)};true`);
    await waitFor(
      () => evaluate(target, `!document.querySelector('#${section}').hidden`),
      2000,
      "PREFERENCE_NAV",
    );
    await evaluate(target, "window.scrollTo(0,0);true");
    comparisons.push(
      await captureSettings(target, output, `options-${section}`),
    );
  }
  await tabFrom(
    target,
    '.settings-nav a[href="#models"]',
    '.settings-nav a[href="#agent"]',
  );
  await tabFrom(
    target,
    '.settings-nav a[href="#agent"]',
    '.settings-nav a[href="#automation"]',
  );
  await evaluate(worker, `chrome.tabs.remove(${tabId}).then(()=>true)`);
  return {
    savedViaUi: true,
    restoredAfterReload: true,
    revisionBound: true,
    panelWriteDenied: true,
    configurationOnly: true,
    navigationKeyboardOrder: true,
    baselineReviewPending: process.env.S28_RECORD_UI_REVIEW === "1",
    comparisons,
  };
}
