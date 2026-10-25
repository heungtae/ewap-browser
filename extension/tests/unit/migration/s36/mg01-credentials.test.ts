import { expect, it } from "vitest";
import type { SecretStore } from "../../../../../apps/agent-server/src/settings/service.js";
import { Mg01SettingsMigration } from "../../../../../apps/agent-server/src/migration/mg01-settings.js";
import { migrationCredentialIdentity } from "../../../../../apps/agent-server/src/migration/mg01-credentials.js";
import { recordSchema } from "../../../../../apps/agent-server/src/migration/mg01-source.js";
import {
  providerSettings,
  providerConfig,
  settingsFixture,
} from "./mg01-support.js";
it("blank writes preserve existing API/header secrets only at the same effective boundary", async () => {
  const f = settingsFixture();
  const source = providerSettings();
  source.providers.primary.config.api_key = "";
  source.providers.primary.config.headers[0]!.value = "";
  const identity = migrationCredentialIdentity(
    recordSchema.parse(source.providers.primary),
    "primary",
    f.profile,
  );
  const existing = JSON.stringify({
    apiKey: "EXISTING_API_CANARY",
    headers: { "x-private": "EXISTING_HEADER_CANARY" },
  });
  await f.secrets.write(identity, existing);
  f.data.value = source;
  const checkpoint = await f.migration.stage(
    "blank",
    1,
    await f.migration.sourceDigest(1),
  );
  expect(checkpoint.copied).toBe(1);
  expect(await f.secrets.read(identity)).toBe(existing);
  expect(JSON.stringify([...f.journal.rows.values()])).not.toContain(
    "EXISTING_API_CANARY",
  );
  source.providers.primary.config.base_url = "https://other.example.test/v1";
  f.data.value = source;
  const other = await f.migration.stage(
    "changed-endpoint",
    1,
    await f.migration.sourceDigest(1),
  );
  expect(other).toMatchObject({ copied: 0, quarantined: 1 });
  expect(await f.secrets.read(identity)).toBe(existing);
});
it("credential identity separates profiles, IDs, kinds, auth and custom-header names", () => {
  const source = providerSettings();
  const row = recordSchema.parse(source.providers.primary);
  const id = migrationCredentialIdentity(row, "primary", "a".repeat(64));
  for (const changed of [
    migrationCredentialIdentity(row, "other", "a".repeat(64)),
    migrationCredentialIdentity(row, "primary", "b".repeat(64)),
    migrationCredentialIdentity(
      { ...row, kind: "typesafe_jev" },
      "primary",
      "a".repeat(64),
    ),
    migrationCredentialIdentity(
      { ...row, config: { ...row.config, api_key_header: "api-key" } },
      "primary",
      "a".repeat(64),
    ),
    migrationCredentialIdentity(
      {
        ...row,
        config: { ...row.config, headers: [{ name: "x-other", value: "" }] },
      },
      "primary",
      "a".repeat(64),
    ),
  ])
    expect(changed).not.toBe(id);
});
it("an enabled selected Jev is still only a disabled unverified controller candidate", async () => {
  const f = settingsFixture();
  f.data.value = {
    ...providerSettings(),
    routing: {
      mode: "jev",
      decision_provider: "decision",
      pre_dispatch_failure: "primary",
    },
    providers: {
      decision: {
        kind: "typesafe_jev",
        config: providerConfig({ model: "jev-1.2.3" }),
      },
    },
  };
  await f.migration.stage("jev", 1, await f.migration.sourceDigest(1));
  expect(f.journal.load(f.profile, "jev")!.conversion).toMatchObject({
    controllerFailure: "stop",
    records: [{ candidateRole: "controller", enabled: false, ready: false }],
  });
});
it("failed credential readback never publishes a settings checkpoint", async () => {
  const store: SecretStore = {
    mode: "session-only",
    async read() {
      return undefined;
    },
    async write() {},
  };
  const f = settingsFixture(store);
  const before = structuredClone(f.data.value);
  await expect(
    f.migration.stage("readback", 1, await f.migration.sourceDigest(1)),
  ).rejects.toThrow("MG01_SECRET_READBACK");
  expect(f.journal.rows.size).toBe(0);
  expect(f.data.value).toEqual(before);
});
it("secret-store errors never echo their credential-bearing exception text", async () => {
  const f = settingsFixture({
    mode: "session-only",
    async read() {
      return undefined;
    },
    async write() {
      throw new Error("PRIVATE_API_CANARY_001");
    },
  });
  await expect(
    f.migration.stage("error", 1, await f.migration.sourceDigest(1)),
  ).rejects.toThrow(/^MG01_SECRET_WRITE_FAILED$/);
  expect(f.journal.rows.size).toBe(0);
});
it("refuses undeclared plaintext secret-store modes", () => {
  const f = settingsFixture();
  expect(
    () =>
      new Mg01SettingsMigration(f.journal, f.source, f.profile, {
        mode: "plaintext",
      } as unknown as SecretStore),
  ).toThrow("MG01_CONFIGURATION");
});
