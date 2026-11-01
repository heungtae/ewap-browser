import assert from "node:assert/strict";
import { readFile, stat, writeFile } from "node:fs/promises";
import { cdp, evaluate, waitFor } from "../chrome-cdp-utils.mjs";
export async function qualifySettings({
  worker,
  panel,
  targets,
  configPath,
  output,
}) {
  const tabId = await evaluate(
    worker,
    "chrome.tabs.create({url:chrome.runtime.getURL('settings/index.html'),active:true}).then(t=>t.id)",
  );
  const settings = await waitFor(
    async () =>
      (await targets()).find((t) => t.url.endsWith("/settings/index.html")),
    5000,
    "SETTINGS_UI",
  );
  await waitFor(
    () =>
      evaluate(
        settings,
        "!!document.querySelector('#provider-primary-select option')",
      ),
    5000,
    "SETTINGS_CLIENT_READY",
  );
  const publicState = () =>
    evaluate(
      settings,
      "chrome.runtime.sendMessage({kind:'settings.read'}).then(r=>r.ok&&r.result.ok?r.result.state:undefined)",
    );
  const revision = async (expected) =>
    waitFor(
      async () => {
        const state = await publicState();
        return state?.revision === expected ? state : undefined;
      },
      5000,
      `SETTINGS_REVISION_${expected}`,
    );
  const fill = async (fields) => {
    await evaluate(
      settings,
      `(()=>{const f=document.querySelector('#provider-form');for(const [key,value]of Object.entries(${JSON.stringify(fields)})){const field=f.elements.namedItem(key);if(typeof value==='boolean')field.checked=value;else field.value=value;}f.requestSubmit();return true})()`,
    );
    await waitFor(
      () =>
        evaluate(
          settings,
          "document.querySelector('#settings-status')?.textContent?.startsWith('저장했습니다.')",
        ),
      5000,
      "PROVIDER_SAVE_PRESENTED",
    );
  };
  await fill({
    provider_id: "fixture-analyst",
    base_url: "https://fixture-provider.test/v1",
    model: "gpt-fixture",
    api_key_header: "authorization_bearer",
    api_key: "SYNTHETIC_CHROME_KEY_123",
    wire_api: "responses",
    enabled: true,
  });
  const first = await revision(1);
  assert.equal(first.providers["fixture-analyst"].has_api_key, true);
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#provider-form [name=api_key]').value===''",
      ),
    5000,
    "WRITE_ONLY_KEY_CLEARED",
  );
  await fill({ api_key: "" });
  const blank = await revision(2);
  assert.equal(blank.providers["fixture-analyst"].has_api_key, true);
  await evaluate(
    settings,
    "document.querySelector('#provider-primary-select').value='fixture-analyst';document.querySelector('#provider-activate').click();true",
  );
  const assigned = await revision(3);
  assert.equal(assigned.roles.analyst, "fixture-analyst");
  assert.equal(assigned.analystReady, false);
  await waitFor(
    () =>
      evaluate(
        settings,
        "!document.querySelector('#provider-activate').disabled",
      ),
    5000,
    "ROLE_ASSIGNMENT_PRESENTED",
  );
  const stale = await evaluate(
    settings,
    "chrome.runtime.sendMessage({kind:'settings.provider.remove',id:'fixture-analyst',revision:0})",
  );
  assert.deepEqual(stale?.result, { ok: false, code: "SETTINGS_STALE" });
  await fill({
    base_url: "https://other-fixture-provider.test/v1",
    api_key: "",
  });
  const changed = await revision(4);
  assert.equal(changed.providers["fixture-analyst"].has_api_key, false);
  const publicJson = JSON.stringify(changed);
  assert.ok(!publicJson.includes("SYNTHETIC_CHROME_KEY"));
  assert.ok(!publicJson.includes("credentialRef"));
  const metadata = await readFile(`${configPath}.settings.json`, "utf8");
  assert.ok(!metadata.includes("SYNTHETIC_CHROME_KEY"));
  assert.equal((await stat(`${configPath}.settings.json`)).mode & 0o777, 0o600);
  // Reimport a synthetic session key to verify it is lost on daemon restart.
  await fill({ api_key: "SYNTHETIC_RESTART_KEY_789" });
  await revision(5);
  const denied = await evaluate(
    panel,
    "chrome.runtime.sendMessage({kind:'settings.provider.remove',id:'fixture-analyst',revision:5})",
  );
  assert.equal(denied?.ok, false);
  await waitFor(
    () =>
      evaluate(
        settings,
        "document.querySelector('#provider-form [name=api_key]').value===''",
      ),
    5000,
    "KEY_REIMPORT_CLEARED",
  );
  await cdp(
    settings.webSocketDebuggerUrl,
    "Emulation.setDeviceMetricsOverride",
    { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false },
  );
  const shot = await cdp(
    settings.webSocketDebuggerUrl,
    "Page.captureScreenshot",
    { format: "png" },
  );
  if (output)
    await writeFile(
      `${output}/provider-settings.png`,
      Buffer.from(shot.data, "base64"),
    );
  return {
    before: {
      providerSavedViaUi: true,
      blankSecretRetained: true,
      endpointChangeDropsCredential: true,
      analystRoleAssigned: true,
      staleRevisionDenied: true,
      publicMetadataSecretFree: true,
      privateMetadataMode: true,
      noAutomaticReadiness: true,
      panelSettingsMutationDenied: true,
    },
    async afterRestart() {
      const state = await waitFor(
        async () => {
          const value = await publicState();
          return value?.revision === 5 ? value : undefined;
        },
        7000,
        "PERSISTED_PROVIDER_AFTER_RESTART",
      );
      assert.equal(state.providers["fixture-analyst"].has_api_key, false);
      await cdp(settings.webSocketDebuggerUrl, "Page.reload");
      await waitFor(
        () =>
          evaluate(
            settings,
            "document.querySelector('#api-key-state')?.textContent?.includes('새 API key')",
          ),
        5000,
        "SESSION_SECRET_REIMPORT_UI",
      );
      await waitFor(
        () =>
          evaluate(
            settings,
            "document.querySelector('#provider-form [name=provider_id]').value==='fixture-analyst' && !document.querySelector('#provider-remove-delete').disabled",
          ),
        5000,
        "PROVIDER_REMOVE_READY",
      );
      await evaluate(
        settings,
        "window.confirm=()=>true;document.querySelector('#provider-remove-delete').click();true",
      );
      const removed = await revision(6);
      assert.equal(removed.providers["fixture-analyst"], undefined);
      assert.equal(removed.roles.analyst, null);
      await waitFor(
        () =>
          evaluate(
            settings,
            "document.querySelector('#provider-management-status')?.textContent?.includes('Provider를 삭제')",
          ),
        5000,
        "REMOVAL_PRESENTED",
      );
      await evaluate(worker, `chrome.tabs.remove(${tabId}).then(()=>true)`);
      return {
        publicMetadataRetainedAfterRestart: true,
        sessionSecretLostTruthfully: true,
        providerRemovedViaUi: true,
        selectedRoleCleared: true,
      };
    },
  };
}
