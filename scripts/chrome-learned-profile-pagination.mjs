import assert from "node:assert/strict";
import { evaluate, waitFor } from "./chrome-cdp-utils.mjs";

export async function verifyManagerPagination(manager, settings, profile) {
  const profiles = Array.from({ length: 12 }, (_, index) => ({
    ...profile,
    profile_id: crypto.randomUUID(),
    name: `프로파일 ${String(index + 1).padStart(2, "0")}`,
    page_match: {
      ...profile.page_match,
      origin: `https://site-${index + 1}.fixture.test`,
      page_key: index.toString(16).padStart(64, "0"),
    },
    enabled: index !== 1,
  }));
  await evaluate(
    settings,
    `chrome.storage.local.set({learned_page_profiles_v1:{schema_version:1,catalog_revision:100,enabled:true,records:${JSON.stringify(profiles)},receipts:[]}})`,
  );
  const click = (selector) =>
    evaluate(
      manager,
      `document.querySelector(${JSON.stringify(selector)}).click()`,
    );
  const ready = (expression, label) =>
    waitFor(() => evaluate(manager, expression), 10000, label);
  await click("#learned-profile-refresh");
  await ready(
    "document.querySelectorAll('.learned-profile-row').length === 10 && document.querySelector('#learned-profile-count').textContent === '12개'",
    "MANAGER_TWELVE_PROFILES",
  );
  await click("#learned-profile-next");
  await ready(
    "document.querySelectorAll('.learned-profile-row').length === 2 && document.querySelector('#learned-profile-next').disabled",
    "MANAGER_PAGE_TWO",
  );
  assert.equal(
    await evaluate(
      manager,
      "document.querySelector('#learned-profile-page').textContent",
    ),
    "11–12 / 12",
  );
  await evaluate(
    manager,
    "document.querySelectorAll('.learned-profile-row')[1].click()",
  );
  await ready(
    "document.querySelector('#learned-profile-detail h3')?.textContent === '프로파일 12'",
    "MANAGER_SELECTION",
  );
  await evaluate(
    manager,
    "window.confirm = () => false; Array.from(document.querySelectorAll('#learned-profile-detail button')).find(b => b.textContent === '삭제').click()",
  );
  assert.equal(
    (
      await evaluate(
        manager,
        "chrome.runtime.sendMessage({kind:'LEARNED_PROFILE_MANAGE',operation:'list'})",
      )
    ).total,
    12,
  );
  await evaluate(
    manager,
    "window.confirm = () => true; Array.from(document.querySelectorAll('#learned-profile-detail button')).find(b => b.textContent === '삭제').click()",
  );
  await ready(
    "document.querySelectorAll('.learned-profile-row').length === 1 && document.querySelector('#learned-profile-count').textContent === '11개'",
    "MANAGER_DELETE_LAST_ROW",
  );
  await evaluate(
    manager,
    "Array.from(document.querySelectorAll('#learned-profile-detail button')).find(b => b.textContent === '삭제').click()",
  );
  await ready(
    "document.querySelectorAll('.learned-profile-row').length === 10 && document.querySelector('#learned-profile-previous').disabled && !!document.querySelector('#learned-profile-json')",
    "MANAGER_DELETE_LAST_PAGE",
  );
  const filter = (value) =>
    evaluate(
      manager,
      `(()=>{const f=document.querySelector('#learned-profile-filter');f.value=${JSON.stringify(value)};f.dispatchEvent(new Event('input'));})()`,
    );
  await filter("site-2.");
  await ready(
    "document.querySelectorAll('.learned-profile-row').length === 1 && document.querySelector('#learned-profile-detail h3')?.textContent === '프로파일 02'",
    "MANAGER_ORIGIN_FILTER",
  );
  await filter("no-matching-profile");
  await ready(
    "document.querySelectorAll('.learned-profile-row').length === 0 && document.querySelector('#learned-profiles').textContent.includes('검색 조건')",
    "MANAGER_NO_MATCH",
  );
  await filter("프로파일 03");
  await ready(
    "document.querySelectorAll('.learned-profile-row').length === 1 && document.querySelector('#learned-profile-json')?.textContent.includes('프로파일 03')",
    "MANAGER_NAME_FILTER",
  );
  await evaluate(
    manager,
    "(()=>{document.querySelector('#learned-profile-detail input[aria-label=\"프로필 표시 이름\"]').value='검증 프로파일';Array.from(document.querySelectorAll('#learned-profile-detail button')).find(b=>b.textContent==='이름 저장').click();})()",
  );
  await ready(
    "document.querySelectorAll('.learned-profile-row').length === 0",
    "MANAGER_RENAME_FILTER",
  );
  await filter("");
  await ready(
    "document.querySelector('.learned-profile-row')?.textContent.includes('프로파일 01') && !!document.querySelector('#learned-profile-json')",
    "MANAGER_RESET_FILTER",
  );
  await evaluate(
    manager,
    "document.querySelectorAll('.learned-profile-row')[2].click()",
  );
  await ready(
    "document.querySelector('#learned-profile-detail h3')?.textContent === '검증 프로파일'",
    "MANAGER_RENAME_PERSISTED",
  );
}
