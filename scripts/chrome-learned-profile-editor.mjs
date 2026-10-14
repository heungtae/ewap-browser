import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";

export async function verifyManagerEditor(manager, options) {
  const ready = (expression, label) =>
    waitFor(() => evaluate(manager, expression), 10000, label);
  const send = (message) =>
    evaluate(
      manager,
      `chrome.runtime.sendMessage(${JSON.stringify({ kind: "LEARNED_PROFILE_MANAGE", ...message })})`,
    );
  const profile = () =>
    evaluate(
      manager,
      "JSON.parse(document.querySelector('#learned-profile-json').textContent)",
    );
  const clickLabel = (label) =>
    evaluate(
      manager,
      `Array.from(document.querySelectorAll('#learned-profile-detail button')).find(b=>b.textContent===${JSON.stringify(label)}).click()`,
    );
  await evaluate(
    manager,
    "document.querySelector('#learned-profile-detail textarea').value='로컬 관리 메모'",
  );
  await clickLabel("메모 저장");
  await ready(
    "document.querySelector('#learned-profile-json')?.textContent.includes('로컬 관리 메모')",
    "MANAGER_NOTES_SAVED",
  );
  await evaluate(
    manager,
    "document.querySelector('#learned-profile-enabled').click()",
  );
  await ready(
    "!document.querySelector('#learned-profile-enabled').disabled && !document.querySelector('#learned-profile-enabled').checked && !!document.querySelector('#learned-profile-json')",
    "MANAGER_FEATURE_OFF",
  );
  assert.equal((await send({ operation: "list" })).total, 10);
  await evaluate(options, "window.dispatchEvent(new Event('focus'))");
  await waitFor(
    () =>
      evaluate(
        options,
        "!document.querySelector('#learned-profile-enabled').checked && document.querySelector('#learned-profile-summary').textContent.includes('10개')",
      ),
    10000,
    "OPTIONS_MANAGER_SYNC",
  );
  await evaluate(
    options,
    "document.querySelector('#learned-profile-enabled').click()",
  );
  await waitFor(
    () =>
      evaluate(
        options,
        "document.querySelector('#learned-profile-enabled').checked && !document.querySelector('#learned-profile-enabled').disabled",
      ),
    10000,
    "OPTIONS_FEATURE_ON",
  );
  await evaluate(
    manager,
    "document.querySelector('#learned-profile-refresh').click()",
  );
  await ready(
    "document.querySelector('#learned-profile-enabled').checked && !!document.querySelector('#learned-profile-json')",
    "MANAGER_FEATURE_ON",
  );
  await evaluate(
    manager,
    "document.querySelector('#learned-profile-detail .learned-profile-controls input[type=checkbox]').click()",
  );
  await ready(
    "document.querySelector('#learned-profile-json') && JSON.parse(document.querySelector('#learned-profile-json').textContent).enabled === false",
    "MANAGER_PROFILE_DISABLED",
  );
  await evaluate(
    manager,
    "document.querySelectorAll('#learned-profile-detail .learned-profile-controls input[type=checkbox]')[1].click()",
  );
  await ready(
    "document.querySelector('#learned-profile-json') && JSON.parse(document.querySelector('#learned-profile-json').textContent).auto_update === false",
    "MANAGER_AUTO_UPDATE_DISABLED",
  );
  const original = await profile();
  const catalog = await send({ operation: "list" });
  assert.equal(
    (
      await send({
        operation: "update",
        revision: catalog.catalog_revision,
        profile_id: original.profile_id,
        patch: { notes: "다른 창의 수정" },
      })
    ).ok,
    true,
  );
  await clickLabel("메모 저장");
  await ready(
    "document.querySelector('#learned-profile-status').textContent.includes('새로 고침')",
    "MANAGER_STALE_EDITOR_REJECTED",
  );
  assert.equal(
    (await send({ operation: "get", profile_id: original.profile_id })).profile
      .notes,
    "다른 창의 수정",
  );
  await evaluate(
    manager,
    "document.querySelector('#learned-profile-refresh').click()",
  );
  await ready(
    "document.querySelector('#learned-profile-json')?.textContent.includes('다른 창의 수정')",
    "MANAGER_STALE_RECOVERY",
  );
  await clickLabel("다음 요청에서 다시 탐색");
  await ready(
    "document.querySelector('#learned-profile-json') && JSON.parse(document.querySelector('#learned-profile-json').textContent).recipes.every(r=>r.lifecycle==='stale')",
    "MANAGER_REDISCOVERY",
  );
  await evaluate(
    manager,
    "document.querySelectorAll('#learned-profile-detail details')[0].open=true",
  );
  assert.equal(
    await evaluate(
      manager,
      "document.querySelector('.list-footer').getBoundingClientRect().bottom <= window.innerHeight",
    ),
    true,
  );
  const screenshot = await cdp(
    manager.webSocketDebuggerUrl,
    "Page.captureScreenshot",
    { format: "png" },
  );
  await writeFile(
    process.env.S24_SCREENSHOT ?? "/tmp/s24-profile-manager.png",
    Buffer.from(screenshot.data, "base64"),
  );
  await cdp(
    manager.webSocketDebuggerUrl,
    "Emulation.setDeviceMetricsOverride",
    { width: 640, height: 900, deviceScaleFactor: 1, mobile: false },
  );
  assert.equal(
    await evaluate(
      manager,
      "getComputedStyle(document.querySelector('.manager-layout')).gridTemplateColumns.split(' ').length",
    ),
    1,
  );
  assert.equal(
    await evaluate(
      manager,
      "document.documentElement.scrollWidth <= window.innerWidth",
    ),
    true,
  );
  await cdp(
    manager.webSocketDebuggerUrl,
    "Emulation.clearDeviceMetricsOverride",
  );
  await evaluate(
    manager,
    "window.confirm=()=>true;Array.from(document.querySelectorAll('#learned-profile-detail button')).filter(b=>b.textContent==='삭제')[1].click()",
  );
  await ready(
    "document.querySelector('#learned-profile-json') && JSON.parse(document.querySelector('#learned-profile-json').textContent).recipes.length === 0",
    "MANAGER_RECIPE_DELETED",
  );
  assert.equal((await profile()).commands.length, 0);
  await evaluate(
    manager,
    "window.confirm=()=>false;document.querySelector('#learned-profile-clear').click()",
  );
  assert.equal((await send({ operation: "list" })).total, 10);
  await evaluate(
    manager,
    "window.confirm=()=>true;document.querySelector('#learned-profile-clear').click()",
  );
  await ready(
    "document.querySelector('#learned-profiles').textContent.includes('저장된 프로파일이 없습니다') && document.querySelector('#learned-profile-count').textContent === '0개'",
    "MANAGER_CLEAR_EMPTY_STATE",
  );
  assert.equal(
    await evaluate(
      manager,
      "document.querySelector('#learned-profile-json') === null",
    ),
    true,
  );
}
