import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { cdp, evaluate, sleep, waitFor } from "./chrome-cdp-utils.mjs";

export const configureS22Settings = async (
  harness,
  mode = "full",
  overrides = {},
) => {
  const extensionId = new URL(harness.panel.url).host;
  const target = await cdp(
    harness.version.webSocketDebuggerUrl,
    "Target.createTarget",
    { url: `chrome-extension://${extensionId}/settings/index.html` },
  );
  const origin = new URL(harness.version.webSocketDebuggerUrl);
  const settings = {
    webSocketDebuggerUrl: `${origin.protocol}//${origin.host}/devtools/page/${target.targetId}`,
  };
  await waitFor(
    () =>
      evaluate(
        settings,
        "Boolean(document.querySelector('[name=approval_mode]'))",
      ).catch(() => false),
    10000,
    "S22_OPTIONS_READY",
  );
  await sleep(400);
  await evaluate(
    settings,
    `(()=>{const select=document.querySelector('[name=approval_mode]');select.value=${JSON.stringify(mode)};select.dispatchEvent(new Event('change',{bubbles:true}));for(const [category,decision] of Object.entries(${JSON.stringify(overrides)})){const field=document.querySelector('[name=approval_'+category+']');field.value=decision;field.dispatchEvent(new Event('change',{bubbles:true}));}document.querySelector('#agent-preferences-form').requestSubmit();return true})()`,
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#agent-preferences-status').textContent.includes('저장했습니다')",
      ),
    10000,
    "S22_OPTIONS_SAVE",
  );
  const stored = await evaluate(
    settings,
    "chrome.runtime.sendMessage({kind:'AGENT_PREFERENCES_GET'})",
  );
  assert.equal(stored.ok, true);
  assert.equal(
    stored.preferences.approval_policy.mode,
    Object.keys(overrides).length ? "custom" : mode,
  );
  assert.ok(stored.preferences.approval_policy.revision >= 1);
  if (process.env.S22_SETTINGS_SCREENSHOT)
    await writeFile(
      process.env.S22_SETTINGS_SCREENSHOT,
      Buffer.from(
        (
          await cdp(settings.webSocketDebuggerUrl, "Page.captureScreenshot", {
            format: "png",
          })
        ).data,
        "base64",
      ),
    );
  await cdp(harness.version.webSocketDebuggerUrl, "Target.closeTarget", {
    targetId: target.targetId,
  });
  await cdp(harness.version.webSocketDebuggerUrl, "Target.activateTarget", {
    targetId: harness.fixtureTarget.targetId,
  });
  return stored.preferences.approval_policy;
};

export const countS22ApprovalCards = async (panel) =>
  evaluate(
    panel,
    `(()=>{return [...document.querySelectorAll('.event-card')].filter(c=>[...c.querySelectorAll('button')].some(b=>['이번 요청에 허용','계획 승인','이번 단계 실행','이번만 허용','확인하고 실행','자료 전송 허용'].some(label=>b.textContent.includes(label)))).length})()`,
  );
