import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";
export const checkS25Settings = async (harness, checks) => {
  const extensionId = new URL(harness.panel.url).host;
  const target = await cdp(
    harness.version.webSocketDebuggerUrl,
    "Target.createTarget",
    { url: `chrome-extension://${extensionId}/settings/index.html` },
  );
  const origin = new URL(harness.version.webSocketDebuggerUrl),
    settings = {
      webSocketDebuggerUrl: `${origin.protocol}//${origin.host}/devtools/page/${target.targetId}`,
    };
  await waitFor(
    () =>
      evaluate(
        settings,
        "Boolean(document.querySelector('#provider-decision-select')?.options.length>1)",
      ).catch(() => false),
    10000,
    "S25_SETTINGS",
  );
  const fields = await evaluate(
    settings,
    `(()=>{const list=document.querySelector('#provider-active-select');list.value='jev';list.dispatchEvent(new Event('change'));return {kind:document.querySelector('[name=provider_kind]').value,wireHidden:getComputedStyle(document.querySelector('[name=wire_api]').closest('label')).display==='none',primary:[...document.querySelector('#provider-primary-select').options].map(o=>o.value),decision:[...document.querySelector('#provider-decision-select').options].map(o=>o.value),key:document.querySelector('[name=api_key]').value}})()`,
  );
  assert.deepEqual(fields, {
    kind: "typesafe_jev",
    wireHidden: true,
    primary: ["", "fixture"],
    decision: ["", "jev"],
    key: "",
  });
  checks.push("Options kind-specific form, role filters and write-only key");
  await evaluate(
    settings,
    "document.querySelector('#provider-primary-select').scrollIntoView({block:'center'})",
  );
  if (process.env.S25_SCREENSHOT)
    await writeFile(
      process.env.S25_SCREENSHOT,
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
};
