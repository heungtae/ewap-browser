import { expect, it, vi } from "vitest";
import { ProviderSettingsService } from "../../../../../apps/agent-server/src/settings/provider-service.js";
import { fixture, provider } from "./provider-fixture.js";
it("retains blank secrets only for the matching provider/kind/endpoint/auth boundary", async () => {
  const f = await fixture();
  await f.service.request({
    kind: "settings.provider.write",
    id: "analyst",
    revision: 0,
    config: provider(),
  });
  const first = (await f.store.read()).providers.analyst!.credentialRef;
  await f.service.request({
    kind: "settings.provider.write",
    id: "analyst",
    revision: 1,
    config: provider({
      api_key: "",
      headers: [{ name: "X-Fixture", value: "" }],
    }),
  });
  const second = (await f.store.read()).providers.analyst!.credentialRef;
  expect(JSON.parse((await f.secrets.read(second))!)).toMatchObject({
    apiKey: provider().api_key,
    headers: { "X-Fixture": "SYNTHETIC_HEADER_456" },
  });
  expect(await f.secrets.read(first)).toBeUndefined();
  expect(
    await f.service.request({
      kind: "settings.provider.write",
      id: "analyst",
      revision: 2,
      config: provider({
        base_url: "https://other.test/v1",
        api_key: "",
        headers: [{ name: "X-Fixture", value: "" }],
      }),
    }),
  ).toMatchObject({
    ok: true,
    state: { providers: { analyst: { has_api_key: false } } },
  });
  expect(await f.secrets.read(second)).toBeUndefined();
});
it("rejects a credential reference replayed against changed public identity", async () => {
  const f = await fixture();
  await f.service.request({
    kind: "settings.provider.write",
    id: "analyst",
    revision: 0,
    config: provider(),
  });
  const state = await f.store.read();
  state.providers.analyst!.base_url = "https://other.test";
  state.revision++;
  await f.store.write(state, 1, () => {});
  expect(await f.service.request({ kind: "settings.read" })).toEqual({
    ok: false,
    code: "SETTINGS_INVALID",
  });
});
it("does not alter the committed credential on a failed public write", async () => {
  const f = await fixture();
  await f.service.request({
    kind: "settings.provider.write",
    id: "analyst",
    revision: 0,
    config: provider(),
  });
  const ref = (await f.store.read()).providers.analyst!.credentialRef;
  const service = new ProviderSettingsService(
    {
      read: () => f.store.read(),
      write: async () => {
        throw Error("INJECTED_WRITE");
      },
    },
    f.secrets,
  );
  const spy = vi.spyOn(f.secrets, "write");
  expect(
    await service.request({
      kind: "settings.provider.write",
      id: "analyst",
      revision: 1,
      config: provider({ api_key: "REPLACEMENT_SYNTHETIC_KEY" }),
    }),
  ).toEqual({ ok: false, code: "SETTINGS_INVALID" });
  expect((await f.store.read()).providers.analyst!.credentialRef).toBe(ref);
  expect(JSON.parse((await f.secrets.read(ref))!).apiKey).toBe(
    provider().api_key,
  );
  const staged = spy.mock.calls[0]![0];
  expect(await f.secrets.read(staged)).toBeUndefined();
});
it("removes public records, selected roles and their credential material", async () => {
  const f = await fixture();
  await f.service.request({
    kind: "settings.provider.write",
    id: "analyst",
    revision: 0,
    config: provider(),
  });
  await f.service.request({
    kind: "settings.roles.write",
    revision: 1,
    roles: { controller: null, analyst: "analyst", controllerEnabled: false },
  });
  const ref = (await f.store.read()).providers.analyst!.credentialRef;
  expect(
    await f.service.request({
      kind: "settings.provider.remove",
      id: "analyst",
      revision: 2,
    }),
  ).toMatchObject({
    ok: true,
    state: {
      revision: 3,
      providers: {},
      roles: { analyst: null, controllerEnabled: false },
    },
  });
  expect(await f.secrets.read(ref)).toBeUndefined();
});
it("keeps committed credentials when write acknowledgement is uncertain", async () => {
  const f = await fixture();
  const service = new ProviderSettingsService(
    {
      read: () => f.store.read(),
      write: async (...args) => {
        await f.store.write(...args);
        throw Error("POST_RENAME_IO_FAILURE");
      },
    },
    f.secrets,
  );
  expect(
    await service.request({
      kind: "settings.provider.write",
      id: "analyst",
      revision: 0,
      config: provider(),
    }),
  ).toEqual({ ok: false, code: "SETTINGS_INVALID" });
  const ref = (await f.store.read()).providers.analyst!.credentialRef;
  expect(JSON.parse((await f.secrets.read(ref))!).apiKey).toBe(
    provider().api_key,
  );
});
