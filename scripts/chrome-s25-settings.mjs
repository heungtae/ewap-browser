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
    `(()=>{const list=document.querySelector('#provider-active-select');list.value='jev';list.dispatchEvent(new Event('change'));return {kind:document.querySelector('[name=provider_kind]').value,decisionId:document.querySelector('#decision-provider-id').value,url:document.querySelector('#decision-provider-url').value,headings:[...document.querySelectorAll('h2')].slice(0,3).map(e=>e.textContent),primary:[...document.querySelector('#provider-primary-select').options].map(o=>o.value),decision:[...document.querySelector('#provider-decision-select').options].map(o=>o.value),key:document.querySelector('#decision-provider-key').value}})()`,
  );
  assert.deepEqual(fields, {
    kind: "openai_compatible",
    decisionId: "jev",
    url: (await harness.send({ kind: "PROVIDER_LIST" })).providers.jev.base_url,
    headings: ["LLM Provider", "Decision LLM Provider", "LLM Provider 관리"],
    primary: ["", "fixture"],
    decision: ["", "jev"],
    key: "",
  });
  const visibility = await evaluate(
    settings,
    `(()=>{const key=document.querySelector('#decision-provider-key'),toggle=document.querySelector('#decision-provider-key-toggle');key.value='s25-fixture-key';toggle.click();const shown=key.type==='text'&&toggle.textContent==='숨김';toggle.click();return {shown,hidden:key.type==='password'&&toggle.textContent==='표시',retained:key.value==='s25-fixture-key'}})()`,
  );
  assert.deepEqual(visibility, { shown: true, hidden: true, retained: true });
  await evaluate(
    settings,
    `(()=>{document.querySelector('#decision-provider-key').value='s25-fixture-key';document.querySelector('#decision-provider-form').requestSubmit();return true})()`,
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#decision-provider-status').value.includes('저장했습니다')",
      ),
    10000,
    "S25_DECISION_SAVE",
  );
  assert.equal(
    await evaluate(
      settings,
      "document.querySelector('#decision-provider-key').value",
    ),
    "",
  );
  const saved = await harness.send({ kind: "PROVIDER_LIST" });
  assert.equal(saved.providers.jev.has_api_key, true);
  assert.equal(saved.providers.jev.kind, "typesafe_jev");
  assert.equal(saved.active_provider, "fixture");
  assert.ok(!JSON.stringify(saved).includes("s25-fixture-key"));
  const management = await evaluate(
    settings,
    `['provider-primary-select','provider-decision-select','provider-jev-enabled','provider-jev-failure','provider-routing-apply','provider-import','provider-remove-delete'].every(id=>document.getElementById(id)?.closest('section').querySelector('h2').textContent==='LLM Provider 관리')`,
  );
  assert.equal(management, true);
  await evaluate(
    settings,
    "document.querySelector('#decision-provider-test').click()",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#decision-provider-status').value.includes('연결 테스트 성공')",
      ),
    10000,
    "S25_DECISION_CONNECTION",
  );
  await evaluate(
    settings,
    `(()=>{HTMLAnchorElement.prototype.click=function(){fetch(this.href).then(r=>r.json()).then(v=>window.testExport=v)};document.querySelector('#decision-provider-export').click();return true})()`,
  );
  await waitFor(
    () => evaluate(settings, "Boolean(window.testExport)"),
    5000,
    "S25_DECISION_EXPORT",
  );
  const exported = await evaluate(settings, "window.testExport");
  assert.deepEqual(Object.keys(exported.providers), ["jev"]);
  assert.equal(exported.providers.jev.kind, "typesafe_jev");
  assert.ok(!JSON.stringify(exported).includes("s25-fixture-key"));
  assert.equal(
    await evaluate(
      settings,
      "['decision-provider-new','provider-management-export','provider-remove-keep'].every(id=>!document.getElementById(id))",
    ),
    true,
  );
  assert.deepEqual(
    await evaluate(
      settings,
      "[document.querySelector('label[for=provider-primary-select]').textContent,document.querySelector('#provider-decision-select').closest('label').firstChild.textContent.trim()]",
    ),
    ["기본 LLM Provider", "판단 LLM Provider"],
  );
  checks.push(
    "Options decision connection/export, role labels, and requested button removal",
  );
  checks.push(
    "Options decision form order, URL/key save, role filters and write-only key",
  );
  await evaluate(
    settings,
    "document.querySelector('#decision-provider-form').scrollIntoView({block:'center'})",
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
