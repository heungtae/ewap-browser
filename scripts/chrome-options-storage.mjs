import assert from "node:assert/strict";
import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";
export const checkOptionsStorage = async (
  settings,
  harness,
  fixture,
  checks,
) => {
  await evaluate(settings, "location.hash='automation'");
  await waitFor(
    () =>
      evaluate(
        settings,
        "!document.querySelector('#learned-profile-enabled').disabled",
      ),
    5000,
    "PROFILE_SETTINGS_READY",
  );
  await evaluate(
    settings,
    "document.querySelector('#learned-profile-enabled').click()",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#learned-profile-status').textContent.includes('적용했습니다')",
      ),
    5000,
    "PROFILE_TOGGLE",
  );
  assert.equal(
    (
      await evaluate(
        settings,
        "chrome.runtime.sendMessage({kind:'LEARNED_PROFILE_MANAGE',operation:'list',limit:1})",
      )
    ).enabled,
    false,
  );
  await evaluate(
    settings,
    "document.querySelector('#learned-profile-enabled').click()",
  );
  await waitFor(
    async () =>
      (
        await evaluate(
          settings,
          "chrome.runtime.sendMessage({kind:'LEARNED_PROFILE_MANAGE',operation:'list',limit:1})",
        )
      ).enabled,
    5000,
    "PROFILE_TOGGLE_BACK",
  );
  await evaluate(
    settings,
    "document.querySelector('#learned-profile-open').click()",
  );
  await waitFor(
    async () =>
      (
        await cdp(harness.version.webSocketDebuggerUrl, "Target.getTargets")
      ).targetInfos.some((t) =>
        t.url.endsWith("/settings/learned-profiles.html"),
      ),
    5000,
    "PROFILE_MANAGER",
  );
  // Invalid JSON must fail visibly; corrected public configuration must save.
  const values = {
    resolver_url: `https://s1.fixture.test:${fixture.fixturePort}/v1/resolve`,
    deployment_id: "options-ux-fixture",
    allowed_origins: `https://s1.fixture.test:${fixture.fixturePort}`,
    key_ring: "invalid-json",
  };
  await evaluate(
    settings,
    `(()=>{location.hash='enterprise';const form=document.querySelector('#profile-form');for(const [name,value] of Object.entries(${JSON.stringify(values)}))form.elements.namedItem(name).value=value;form.requestSubmit();return true})()`,
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#profile-status').value.includes('형식')",
      ),
    5000,
    "RESOLVER_INVALID_JSON",
  );
  const keyRing = JSON.stringify({ s1: fixture.publicKey });
  await evaluate(
    settings,
    `(()=>{const form=document.querySelector('#profile-form');form.elements.namedItem('key_ring').value=${JSON.stringify(keyRing)};form.requestSubmit();return true})()`,
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#profile-status').value.includes('저장했습니다')",
      ),
    5000,
    "RESOLVER_SAVE",
  );
  assert.equal(
    await evaluate(
      settings,
      "chrome.storage.local.get('profile_resolver').then(v=>v.profile_resolver.deployment_id)",
    ),
    "options-ux-fixture",
  );
  assert.equal(
    await evaluate(
      settings,
      "document.querySelector('#profile-form .form-save-state').textContent",
    ),
    "",
  );
  checks.push(
    "learned-profile feature changes persist immediately, separate manager opens, resolver rejects invalid JSON and saves corrected public settings",
  );
};
