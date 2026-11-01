import { expect, it } from "vitest";
import { createSettingsClient } from "../../../../../apps/chrome-extension/src/presentation/settings-client.js";
import { commandAvailable } from "../../../../../apps/chrome-extension/src/bridge/capabilities.js";
import { fixture, provider } from "./provider-fixture.js";
it("adapts preserved Provider forms to typed settings commands and public-only exports", async () => {
  const f = await fixture();
  const client = createSettingsClient((command) => f.service.request(command));
  expect(await client.sendMessage({ kind: "PROVIDER_LIST" })).toMatchObject({
    ok: true,
    revision: 0,
    routing: { pre_dispatch_failure: "stop" },
  });
  expect(
    await client.sendMessage({
      kind: "PROVIDER_SAVE",
      payload: { id: "analyst", revision: 0, config: provider() },
    }),
  ).toMatchObject({
    ok: true,
    revision: 1,
    providers: { analyst: { has_api_key: true } },
  });
  expect(
    await client.sendMessage({
      kind: "PROVIDER_SET_ACTIVE",
      payload: { id: "analyst", revision: 1 },
    }),
  ).toMatchObject({ active_provider: "analyst", analyst_ready: false });
  const exported = await client.sendMessage({ kind: "PROVIDER_EXPORT" });
  expect(exported).toHaveProperty("export");
  expect(JSON.stringify(exported)).not.toContain("SYNTHETIC_PROVIDER_KEY");
  expect(JSON.stringify(exported)).not.toContain("SYNTHETIC_HEADER");
  expect(JSON.stringify(exported)).not.toContain("credentialRef");
  await expect(
    client.sendMessage({
      kind: "PROVIDER_SET_ROUTING",
      payload: {
        revision: 2,
        routing: { mode: "single", pre_dispatch_failure: "primary" },
      },
    }),
  ).rejects.toThrow("작업 중단");
  expect((await f.store.read()).revision).toBe(2);
});
it("masks invalid backend responses and unsupported management commands", async () => {
  const client = createSettingsClient(async () => ({
    ok: false,
    code: "PRIVATE_CANARY",
  }));
  const message = await client.read().catch((error) => String(error));
  expect(message).not.toContain("PRIVATE_CANARY");
  await expect(
    client.sendMessage({ kind: "PROVIDER_TEST", payload: { id: "analyst" } }),
  ).rejects.toThrow("아직 연결되지");
});
it("requires an explicit capability for settings while preserving migration capability selection", () => {
  expect(commandAvailable("settings.read", new Set(["heartbeat"]))).toBe(false);
  expect(
    commandAvailable("settings.provider.write", new Set(["settings"])),
  ).toBe(true);
  expect(
    commandAvailable(
      "migration.resume.snapshot",
      new Set(["migration.resume"]),
    ),
  ).toBe(false);
  expect(
    commandAvailable(
      "migration.resume.snapshot",
      new Set(["migration.resumeSnapshot"]),
    ),
  ).toBe(true);
});
