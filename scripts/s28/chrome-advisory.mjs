import { tabFrom } from "./settings-focus.mjs";
import assert from "node:assert/strict";
import { captureSettings } from "./settings-capture.mjs";
import { build } from "esbuild";
import { writeFile } from "node:fs/promises";
import { cdp, evaluate, waitFor } from "../chrome-cdp-utils.mjs";
export async function qualifyAdvisory({ worker, targets, output, panel }) {
  const built = await build({
    entryPoints: ["extension/tests/fixture/s29/advisory-worker.ts"],
    bundle: true,
    format: "iife",
    globalName: "ManagerFixture",
    platform: "browser",
    write: false,
  });
  await evaluate(worker, built.outputFiles[0].text);
  const seeded = await evaluate(
    worker,
    "ManagerFixture.seedAdvisoryManager().then(value=>({ok:true,...value})).catch(error=>({ok:false,error:String(error)}))",
  );
  assert.equal(seeded?.ok, true, JSON.stringify(seeded));
  const settingsId = await evaluate(
    worker,
    "chrome.tabs.create({url:chrome.runtime.getURL('settings/index.html#automation'),active:true}).then(t=>t.id)",
  );
  const settings = await waitFor(
    async () =>
      (await targets()).find((t) =>
        t.url.endsWith("/settings/index.html#automation"),
      ),
    5000,
    "ADVISORY_SETTINGS",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "!!document.querySelector('#workflow-records .workflow-row') && !document.querySelector('#learned-profile-enabled').disabled",
      ),
    5000,
    "ADVISORY_SETTINGS_READY",
  );
  await evaluate(
    settings,
    "document.querySelector('#learned-profile-open').click();true",
  );
  const manager = await waitFor(
    async () =>
      (await targets()).find((t) =>
        t.url.endsWith("/settings/learned-profiles.html"),
      ),
    5000,
    "ADVISORY_MANAGER",
  );
  await waitFor(
    () =>
      evaluate(
        manager,
        "!!document.querySelector('.learned-profile-row') && !!document.querySelector('#learned-profile-detail h4')",
      ),
    5000,
    "ADVISORY_ROWS",
  );
  await evaluate(
    settings,
    "document.querySelector('#learned-profile-open').click();true",
  );
  assert.equal(
    (await targets()).filter((t) =>
      t.url.endsWith("/settings/learned-profiles.html"),
    ).length,
    1,
  );
  await evaluate(
    manager,
    "(()=>{const root=document.querySelector('#learned-profile-detail');root.querySelector('input[aria-label=\"프로필 표시 이름\"]').value='Managed fixture profile';[...root.querySelectorAll('button')].find(b=>b.textContent==='이름 저장').click();return true})()",
  );
  await waitFor(
    () =>
      evaluate(
        manager,
        "document.querySelector('.profile-row-name')?.textContent==='Managed fixture profile' && document.querySelector('#learned-profile-status').textContent.startsWith('참고 기록을 불러왔습니다')",
      ),
    5000,
    "PROFILE_RENAMED",
  );
  await evaluate(
    manager,
    "(()=>{const root=document.querySelector('#learned-profile-detail');root.querySelector('textarea').value='Local fixture note';[...root.querySelectorAll('button')].find(b=>b.textContent==='메모 저장').click();return true})()",
  );
  await waitFor(
    () =>
      evaluate(
        manager,
        "document.querySelector('#learned-profile-json')?.textContent?.includes('Local fixture note')",
      ),
    5000,
    "NOTE_SAVED",
  );
  await evaluate(
    manager,
    "(()=>{const history=[...document.querySelectorAll('#learned-profile-detail details')].find(d=>d.querySelector('summary')?.textContent==='레시피 변경 이력과 단계 비교');history.open=true;return true})()",
  );
  await waitFor(
    () =>
      evaluate(
        manager,
        "[...document.querySelectorAll('#learned-profile-detail details p')].filter(e=>e.textContent.includes('원본 revision')).length===2",
      ),
    5000,
    "SOURCE_HISTORY",
  );
  const denied = await evaluate(
    panel,
    `chrome.runtime.sendMessage({kind:'advisory.clear',revision:${Number(seeded.revision) + 2}})`,
  );
  assert.equal(denied?.ok, false);
  await cdp(
    manager.webSocketDebuggerUrl,
    "Emulation.setDeviceMetricsOverride",
    { width: 1180, height: 820, deviceScaleFactor: 1, mobile: false },
  );
  const screenshot = await cdp(
    manager.webSocketDebuggerUrl,
    "Page.captureScreenshot",
    { format: "png" },
  );
  if (output)
    await writeFile(
      `${output}/advisory-manager.png`,
      Buffer.from(screenshot.data, "base64"),
    );
  await evaluate(
    manager,
    "(()=>{const input=document.querySelector('#learned-profile-filter');input.value='no-such-profile';input.dispatchEvent(new Event('input',{bubbles:true}));return true})()",
  );
  await waitFor(
    () =>
      evaluate(
        manager,
        "document.querySelectorAll('.learned-profile-row').length===0",
      ),
    5000,
    "PROFILE_FILTER",
  );
  await evaluate(
    manager,
    "(()=>{const input=document.querySelector('#learned-profile-filter');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));return true})()",
  );
  await waitFor(
    () =>
      evaluate(
        manager,
        "!!document.querySelector('#learned-profile-detail h3')",
      ),
    5000,
    "PROFILE_FILTER_RESET",
  );
  await evaluate(
    settings,
    "document.querySelector('#workflow-refresh').click();true",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "!document.querySelector('#workflow-records .workflow-row input').disabled && document.querySelector('#workflow-records-status').textContent.startsWith('참고 기록입니다')",
      ),
    5000,
    "WORKFLOW_REFRESHED",
  );
  await cdp(
    settings.webSocketDebuggerUrl,
    "Emulation.setDeviceMetricsOverride",
    { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false },
  );
  await evaluate(settings, "window.scrollTo(0,0);true");
  const workflowComparison = await captureSettings(
    settings,
    output,
    "workflow-catalog",
  );
  await evaluate(
    settings,
    "(()=>{const row=document.querySelector('#workflow-records .workflow-row');row.querySelector('input').value='Renamed fixture workflow';[...row.querySelectorAll('button')].find(b=>b.textContent==='이름 저장').click();return true})()",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#workflow-records .workflow-row input')?.value==='Renamed fixture workflow' && !document.querySelector('#workflow-records .workflow-row input').disabled",
      ),
    5000,
    "WORKFLOW_RENAMED",
  );
  await evaluate(
    settings,
    "(()=>{const checkbox=document.querySelector('#workflow-records input[type=checkbox]');checkbox.checked=false;checkbox.dispatchEvent(new Event('change',{bubbles:true}));return true})()",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "!document.querySelector('#workflow-records input[type=checkbox]').checked && !document.querySelector('#workflow-records input[type=checkbox]').disabled",
      ),
    5000,
    "WORKFLOW_DISABLED",
  );
  await evaluate(
    settings,
    "window.confirm=()=>true;document.querySelector('#workflow-records .danger-button').click();true",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelectorAll('#workflow-records .workflow-row').length===0",
      ),
    5000,
    "WORKFLOW_DELETED",
  );
  await evaluate(
    manager,
    "document.querySelector('#learned-profile-refresh').click();true",
  );
  await waitFor(
    () =>
      evaluate(
        manager,
        "!!document.querySelector('#learned-profile-detail h4')",
      ),
    5000,
    "PROFILE_REFRESHED",
  );
  await evaluate(
    manager,
    "window.confirm=()=>true;[...document.querySelectorAll('#learned-profile-detail .button-row button')].find(b=>b.textContent==='삭제').click();true",
  );
  await waitFor(
    () =>
      evaluate(
        manager,
        "document.querySelectorAll('.learned-profile-row').length===0",
      ),
    5000,
    "PROFILE_DELETED",
  );
  await cdp(
    manager.webSocketDebuggerUrl,
    "Emulation.setDeviceMetricsOverride",
    { width: 1100, height: 800, deviceScaleFactor: 1, mobile: false },
  );
  await evaluate(manager, "window.scrollTo(0,0);true");
  const managerComparison = await captureSettings(
    manager,
    output,
    "profile-manager",
  );
  await tabFrom(manager, "#learned-profile-filter", "#learned-profile-refresh");
  const managers = await evaluate(
    worker,
    "chrome.tabs.query({url:chrome.runtime.getURL('settings/learned-profiles.html')}).then(ts=>ts.map(t=>t.id))",
  );
  await evaluate(
    worker,
    `chrome.tabs.remove(${JSON.stringify([...managers, settingsId])}).then(()=>true)`,
  );
  return {
    baselineComparisons: [workflowComparison, managerComparison],
    actualIndexedDb: true,
    managerWindowReused: true,
    managerKeyboardOrder: true,
    profileRenamed: true,
    localNoteSaved: true,
    sourceHistoryShown: true,
    filterVerified: true,
    workflowRenamed: true,
    workflowDisabled: true,
    workflowDeleted: true,
    profileDeleted: true,
    panelMutationDenied: true,
    source:
      "synthetic advisory imports; no legacy storage or execution authority",
  };
}
