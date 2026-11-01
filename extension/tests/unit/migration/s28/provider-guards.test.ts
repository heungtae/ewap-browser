import { readdir } from "node:fs/promises";
import { expect, it } from "vitest";
import { ProviderSettingsService } from "../../../../../apps/agent-server/src/settings/provider-service.js";
import { fixture, provider } from "./provider-fixture.js";
it("keeps a disabled Controller configured without enabling it or qualifying readiness", async () => {
  const f = await fixture();
  await f.service.request({
    kind: "settings.provider.write",
    id: "controller",
    revision: 0,
    config: provider({
      kind: "typesafe_jev",
      plugin_id: "contextpilot.typesafe-jev",
      model: "jev-0.2.2",
      wire_api: "chat_completions",
      enabled: false,
    }),
  });
  expect(
    await f.service.request({
      kind: "settings.roles.write",
      revision: 1,
      roles: {
        controller: "controller",
        analyst: null,
        controllerEnabled: false,
      },
    }),
  ).toMatchObject({
    ok: true,
    state: {
      controllerReady: false,
      roles: { controllerEnabled: false },
      providers: { controller: { enabled: false } },
    },
  });
  expect(
    await f.service.request({
      kind: "settings.roles.write",
      revision: 2,
      roles: {
        controller: "controller",
        analyst: null,
        controllerEnabled: true,
      },
    }),
  ).toEqual({ ok: false, code: "SETTINGS_INVALID" });
  expect((await f.store.read()).revision).toBe(2);
});
it("rejects an invalidated settings request before the atomic rename and cleans staged material", async () => {
  const f = await fixture();
  let invalidated = false;
  const service = new ProviderSettingsService(
    {
      read: () => f.store.read(),
      write: async (state, revision, guard) => {
        invalidated = true;
        await f.store.write(state, revision, guard);
      },
    },
    f.secrets,
  );
  const result = await service.request(
    {
      kind: "settings.provider.write",
      id: "analyst",
      revision: 0,
      config: provider(),
    },
    () => {
      if (invalidated) throw Error("SETTINGS_UNAVAILABLE");
    },
  );
  expect(result).toEqual({ ok: false, code: "SETTINGS_UNAVAILABLE" });
  expect((await f.store.read()).revision).toBe(0);
  expect(await readdir(f.directory)).toEqual([]);
});
