import { checkOptionsRemoval } from "./chrome-options-removal.mjs";
import { checkOptionsStorage } from "./chrome-options-storage.mjs";
import { checkOptionsViewports } from "./chrome-options-viewports.mjs";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import { openS19Chrome } from "./chrome-s19-harness.mjs";
import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";
import { checkOptionsNavigation } from "./chrome-options-navigation.mjs";
import { checkOptionsWorkflows } from "./chrome-options-workflows.mjs";
const cert = await mkdtemp(join(tmpdir(), "options-ux-"));
const checks = [];
let fixture, harness;
try {
  fixture = await createS1Fixture(cert);
  harness = await openS19Chrome({
    executable: process.env.CHROME_FOR_TESTING_BIN,
    fixture,
  });
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
        "document.querySelector('#provider-primary-select')?.value==='fixture' && document.querySelector('#screenshot-permission-status').value.length>0",
      ),
    10000,
    "OPTIONS_READY",
  );
  assert.equal(
    await evaluate(
      settings,
      "document.getElementById('provider-active-select')",
    ),
    null,
  );
  await checkOptionsNavigation(settings, checks);
  // A non-local provider must be the target of every form action.
  await evaluate(
    settings,
    `(()=>{window.__messages=[];const send=chrome.runtime.sendMessage.bind(chrome.runtime);chrome.runtime.sendMessage=m=>{window.__messages.push({kind:m.kind,id:m.payload?.id});if(m.kind==='PROVIDER_MODELS')return Promise.resolve({ok:true,models:['fixture-model']});return send(m)};const f=document.querySelector('#provider-form');f.elements.namedItem('provider_id').value='ux-secondary';f.elements.namedItem('model').dispatchEvent(new Event('input',{bubbles:true}));f.requestSubmit();return true})()`,
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#settings-status').value.includes('저장했습니다')",
      ),
    10000,
    "PROVIDER_SAVE",
  );
  assert.equal(
    await evaluate(
      settings,
      "document.querySelector('#provider-primary-select').value",
    ),
    "ux-secondary",
  );
  await evaluate(settings, "document.querySelector('#provider-test').click()");
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#settings-status').value.includes('연결 테스트 성공')",
      ),
    10000,
    "SELECTED_PROVIDER_TEST",
  );
  await evaluate(
    settings,
    "document.querySelector('#provider-models-load').click()",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#settings-status').value.includes('모델 불러오기 완료')",
      ),
    10000,
    "SELECTED_PROVIDER_MODELS",
  );
  assert.deepEqual(
    await evaluate(
      settings,
      "window.__messages.filter(m=>['PROVIDER_TEST','PROVIDER_MODELS'].includes(m.kind)).map(m=>m.id)",
    ),
    ["ux-secondary", "ux-secondary"],
  );
  assert.equal(
    await evaluate(settings, "document.querySelector('[name=model]').value"),
    "fixture-model",
  );
  assert.equal(
    (await harness.send({ kind: "PROVIDER_LIST" })).active_provider,
    "fixture",
  );
  checks.push(
    "save keeps edited provider selected; test and model discovery target selected identity; primary role unchanged",
  );
  await evaluate(
    settings,
    `(()=>{HTMLAnchorElement.prototype.click=function(){fetch(this.href).then(r=>r.json()).then(v=>window.__export=v)};document.querySelector('#provider-export').click();return true})()`,
  );
  await waitFor(
    () => evaluate(settings, "Boolean(window.__export)"),
    5000,
    "PROVIDER_EXPORT",
  );
  assert.deepEqual(
    Object.keys(await evaluate(settings, "window.__export.providers")),
    ["ux-secondary"],
  );
  await evaluate(
    settings,
    `(()=>{const input=document.querySelector('#provider-public-file'),transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(window.__export)],'provider.json',{type:'application/json'}));input.files=transfer.files;input.dispatchEvent(new Event('change'));return true})()`,
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#provider-management-status').value.includes('양식에 불러왔습니다')",
      ),
    5000,
    "EXPORT_IMPORT_ROUNDTRIP",
  );
  checks.push(
    "selected provider export can be imported; secrets excluded; imported form remains unsaved",
  );
  // Apply roles while an editor contains changes: refresh must preserve the draft.
  await evaluate(
    settings,
    `(()=>{const model=document.querySelector('[name=model]');model.value='draft-model';model.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#provider-activate').click();return true})()`,
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#provider-management-status').value==='변경사항을 저장했습니다.'",
      ),
    5000,
    "ROLE_REFRESH",
  );
  assert.equal(
    await evaluate(settings, "document.querySelector('[name=model]').value"),
    "draft-model",
  );
  await evaluate(
    settings,
    `(()=>{window.confirm=()=>false;const s=document.querySelector('#provider-primary-select');s.value='fixture';s.dispatchEvent(new Event('change'));return true})()`,
  );
  assert.equal(
    await evaluate(
      settings,
      "document.querySelector('#provider-primary-select').value",
    ),
    "ux-secondary",
  );
  checks.push(
    "role refresh preserves unsaved editor; cancelled selection preserves draft and selected provider",
  );
  await checkOptionsStorage(settings, harness, fixture, checks);
  await checkOptionsWorkflows(settings, checks);
  await checkOptionsRemoval(settings, harness, checks);
  await checkOptionsViewports(settings, checks);
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        scope: "controlled Chrome; no live provider or deployment claim",
        checks,
      },
      null,
      2,
    ),
  );
} finally {
  await harness?.close();
  await new Promise((resolve) => fixture?.fixture.close(resolve) ?? resolve());
  await rm(cert, { recursive: true, force: true });
}
