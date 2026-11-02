import { expect, it } from "vitest";
import { fixture, provider } from "./provider-fixture.js";
import { ProviderSettingsService } from "../../../../../apps/agent-server/src/settings/provider-service.js";
import { SessionSecrets } from "../../../../../apps/agent-server/src/settings/service.js";
import { defaultAgentPreferences } from "../../../../../packages/shared/src/preferences.js";
import { createSettingsClient } from "../../../../../apps/chrome-extension/src/presentation/settings-client.js";
it("saves closed preference metadata with server revision and retains it through restart without task readiness", async () => {
  const f = await fixture(),
    value = defaultAgentPreferences();
  const client = createSettingsClient((command) => f.service.request(command));
  value.approval_policy.mode = "full";
  value.approval_policy.revision = 999;
  value.screenshot_policy = "disabled";
  const saved = await client.savePreferences(0, value);
  expect(saved).toMatchObject({
    revision: 1,
    controllerReady: false,
    analystReady: false,
    preferences: {
      screenshot_policy: "disabled",
      permission_mode: "standard",
      approval_policy: {
        mode: "full",
        revision: 1,
        categories: { action_execution: "auto" },
      },
    },
  });
  const restarted = new ProviderSettingsService(
    f.store,
    new SessionSecrets(128),
  );
  expect(await restarted.request({ kind: "settings.read" })).toMatchObject({
    ok: true,
    state: { preferences: saved.preferences },
  });
  await expect(
    client.savePreferences(0, defaultAgentPreferences()),
  ).rejects.toThrow("다른 창");
  expect((await f.store.read()).revision).toBe(1);
});
it("rejects grant-like/unknown preference fields and cancelled writes without changing provider state", async () => {
  const f = await fixture();
  await f.service.request({
    kind: "settings.provider.write",
    id: "fixture",
    revision: 0,
    config: provider(),
  });
  const before = await f.store.read();
  for (const preferences of [
    { ...defaultAgentPreferences(), token: "forbidden" },
    { ...defaultAgentPreferences(), screenshot_policy: "any" },
  ]) {
    expect(
      await f.service.request({
        kind: "settings.preferences.write",
        revision: 1,
        preferences,
      }),
    ).toEqual({ ok: false, code: "SETTINGS_INVALID" });
  }
  expect(
    await f.service.request(
      {
        kind: "settings.preferences.write",
        revision: 1,
        preferences: defaultAgentPreferences(),
      },
      () => {
        throw Error("SETTINGS_UNAVAILABLE");
      },
    ),
  ).toEqual({ ok: false, code: "SETTINGS_UNAVAILABLE" });
  expect(await f.store.read()).toEqual(before);
});
