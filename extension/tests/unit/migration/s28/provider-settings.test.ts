import { readFile, stat, writeFile, symlink, chmod } from "node:fs/promises";
import { expect, it } from "vitest";
import { ProviderSettingsService } from "../../../../../apps/agent-server/src/settings/provider-service.js";
import { FileSettingsPersistence } from "../../../../../apps/agent-server/src/settings/provider-file.js";
import { SessionSecrets } from "../../../../../apps/agent-server/src/settings/service.js";
import { fixture, provider, scope } from "./provider-fixture.js";
it("persists only public metadata and exposes truthful session-only readiness after restart", async () => {
  const f = await fixture();
  const result = await f.service.request({
    kind: "settings.provider.write",
    id: "analyst",
    revision: 0,
    config: provider(),
  });
  expect(result).toMatchObject({
    ok: true,
    state: {
      revision: 1,
      secretMode: "session-only",
      controllerReady: false,
      analystReady: false,
      providers: { analyst: { has_api_key: true } },
    },
  });
  const saved = await readFile(f.path, "utf8");
  expect(saved).not.toContain("SYNTHETIC_PROVIDER_KEY");
  expect(saved).not.toContain("SYNTHETIC_HEADER");
  expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PROVIDER_KEY");
  expect(JSON.stringify(result)).not.toContain("credentialRef");
  expect((await stat(f.path)).mode & 0o777).toBe(0o600);
  const restarted = new ProviderSettingsService(
    f.store,
    new SessionSecrets(128),
  );
  expect(await restarted.request({ kind: "settings.read" })).toMatchObject({
    ok: true,
    state: {
      revision: 1,
      providers: { analyst: { has_api_key: false } },
      controllerReady: false,
    },
  });
});
it("serializes competing revision writes and refuses stale retries without another mutation", async () => {
  const f = await fixture();
  const results = await Promise.all(
    ["one", "two"].map((id) =>
      f.service.request({
        kind: "settings.provider.write",
        id,
        revision: 0,
        config: provider({ api_key: "", headers: [] }),
      }),
    ),
  );
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.find((r) => !r.ok)).toEqual({
    ok: false,
    code: "SETTINGS_STALE",
  });
  expect((await f.store.read()).revision).toBe(1);
});
it("assigns typed controller/analyst roles and cannot enable GPT as controller", async () => {
  const f = await fixture();
  await f.service.request({
    kind: "settings.provider.write",
    id: "analyst",
    revision: 0,
    config: provider(),
  });
  expect(
    await f.service.request({
      kind: "settings.roles.write",
      revision: 1,
      roles: { controller: "analyst", analyst: null, controllerEnabled: true },
    }),
  ).toEqual({ ok: false, code: "SETTINGS_INVALID" });
  await f.service.request({
    kind: "settings.provider.write",
    id: "controller",
    revision: 1,
    config: provider({
      kind: "typesafe_jev",
      plugin_id: "contextpilot.typesafe-jev",
      model: "jev-0.2.2",
      wire_api: "chat_completions",
      api_key: "SYNTHETIC_CONTROLLER_KEY",
    }),
  });
  expect(
    await f.service.request({
      kind: "settings.roles.write",
      revision: 2,
      roles: {
        controller: "controller",
        analyst: "analyst",
        controllerEnabled: true,
      },
    }),
  ).toMatchObject({
    ok: true,
    state: {
      revision: 3,
      controllerFailure: "stop",
      controllerReady: false,
      analystReady: false,
    },
  });
  expect(
    await f.service.request({
      kind: "settings.roles.write",
      revision: 3,
      roles: {
        controller: "controller",
        analyst: "analyst",
        controllerEnabled: true,
      },
      controllerFailure: "primary",
    }),
  ).toEqual({ ok: false, code: "SETTINGS_INVALID" });
});
it("rejects unsafe endpoints, header ambiguity and sensitive public metadata before commit", async () => {
  const f = await fixture();
  for (const patch of [
    { base_url: "https://user:pass@provider.test" },
    { base_url: "http://public.test" },
    { base_url: "https://provider.test?token=x" },
    {
      headers: [
        { name: "X-Key", value: "first" },
        { name: "x-key", value: "second" },
      ],
    },
    { label: "SYNTHETIC_PROVIDER_KEY_123" },
  ])
    expect(
      await f.service.request({
        kind: "settings.provider.write",
        id: "analyst",
        revision: 0,
        config: provider(patch),
      }),
    ).toEqual({ ok: false, code: "SETTINGS_INVALID" });
  expect((await f.store.read()).revision).toBe(0);
});
it("checks persisted installation/profile scope, symlinks and private directory permissions", async () => {
  const f = await fixture();
  await f.service.request({
    kind: "settings.provider.write",
    id: "analyst",
    revision: 0,
    config: provider(),
  });
  await expect(
    new FileSettingsPersistence(f.path, {
      ...scope,
      profileId: "33333333-3333-4333-8333-333333333333",
    }).read(),
  ).rejects.toThrow();
  const link = `${f.directory}/linked.json`;
  await symlink(f.path, link);
  await expect(
    new FileSettingsPersistence(link, scope).read(),
  ).rejects.toThrow();
  await chmod(f.directory, 0o755);
  await expect(f.store.read()).rejects.toThrow();
  await chmod(f.directory, 0o700);
  await writeFile(f.path, "invalid");
  expect(await f.service.request({ kind: "settings.read" })).toEqual({
    ok: false,
    code: "SETTINGS_INVALID",
  });
});

it("projects installation scope without carrying pairing configuration into public state", async () => {
  const f = await fixture();
  const config = {
    ...scope,
    secret: "SYNTHETIC_PAIRING_SCOPE_CANARY",
    socketPath: "/private/socket",
  };
  const store = new FileSettingsPersistence(f.path, config);
  expect(await store.read()).not.toHaveProperty("secret");
  expect(JSON.stringify(await store.read())).not.toContain(
    "SYNTHETIC_PAIRING_SCOPE_CANARY",
  );
});
