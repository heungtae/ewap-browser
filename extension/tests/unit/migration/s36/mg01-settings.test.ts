import { expect, it } from "vitest";
import { SessionSecrets } from "../../../../../apps/agent-server/src/settings/service.js";
import {
  providerConfig,
  providerSettings,
  settingsFixture,
} from "./mg01-support.js";
it.each([1, 2])(
  "converts actual v%s settings to disabled public records with readback-verified secret references",
  async (version) => {
    const f = settingsFixture();
    f.data.value =
      version === 1
        ? {
            schema_version: 1,
            active_provider: "primary",
            providers: { primary: providerConfig() },
          }
        : providerSettings();
    const original = structuredClone(f.data.value);
    const hash = await f.migration.sourceDigest(1);
    const checkpoint = await f.migration.stage("settings", 1, hash);
    expect(checkpoint).toMatchObject({
      copied: 1,
      quarantined: 0,
      sourceCount: 1,
    });
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    const saved = f.journal.load(f.profile, "settings")!;
    expect(saved.conversion).toMatchObject({
      controllerFailure: "stop",
      secretMode: "session-only",
      records: [
        {
          enabled: false,
          ready: false,
          candidateRole: "analyst",
          credentialRef: { hasMaterial: true },
        },
      ],
    });
    expect(JSON.stringify(saved)).not.toMatch(
      /PRIVATE_API_CANARY|PRIVATE_HEADER_CANARY|api_key|archive/,
    );
    expect(
      await f.secrets.read(saved.conversion.records[0]!.credentialRef.identity),
    ).toContain("PRIVATE_API_CANARY_001");
    expect(await f.migration.validate("settings", 1, checkpoint)).toBe(true);
    expect(await f.migration.stage("settings", 1, hash)).toEqual(checkpoint);
    expect(f.data.value).toEqual(original);
  },
);
it("preserves disabled, non-GPT and invalid records without auto-enabling or losing counts", async () => {
  const f = settingsFixture();
  f.data.value = {
    ...providerSettings(),
    providers: {
      primary: { kind: "openai_compatible", config: providerConfig() },
      disabled: {
        kind: "typesafe_jev",
        config: providerConfig({ model: "jev-1.2.3", enabled: false }),
      },
      other: {
        kind: "openai_compatible",
        config: providerConfig({ model: "other-model" }),
      },
      invalid: { kind: "unknown", config: { api_key: "PRIVATE_INVALID_KEY" } },
    },
    routing: {
      mode: "jev",
      decision_provider: "disabled",
      pre_dispatch_failure: "primary",
    },
  };
  const checkpoint = await f.migration.stage(
    "mixed",
    1,
    await f.migration.sourceDigest(1),
  );
  expect(checkpoint).toMatchObject({
    sourceCount: 4,
    copied: 3,
    quarantined: 1,
  });
  const records = f.journal.load(f.profile, "mixed")!.conversion.records;
  expect(records.find((row) => row.providerId === "disabled")).toMatchObject({
    repair: "DISABLED",
    enabled: false,
    ready: false,
  });
  expect(records.find((row) => row.providerId === "other")).toMatchObject({
    repair: "ROLE_REQUIRES_REPAIR",
  });
  expect(JSON.stringify([...f.journal.rows.values()])).not.toContain(
    "PRIVATE_INVALID_KEY",
  );
});
it("session restart invalidates credential readback until an explicit fresh-source retry restores it", async () => {
  const store = new SessionSecrets();
  const f = settingsFixture(store);
  const hash = await f.migration.sourceDigest(1);
  const checkpoint = await f.migration.stage("restart", 1, hash);
  store.clear();
  expect(await f.migration.validate("restart", 1, checkpoint)).toBe(false);
  expect(await f.migration.stage("restart", 1, hash)).toEqual(checkpoint);
});
it("quarantines secret-bearing public metadata before credential transfer or public persistence", async () => {
  const f = settingsFixture();
  const source = providerSettings();
  source.providers.primary.config.label = "PRIVATE_API_CANARY_001";
  f.data.value = source;
  expect(
    await f.migration.stage("leak", 1, await f.migration.sourceDigest(1)),
  ).toMatchObject({ copied: 0, quarantined: 1 });
  expect(JSON.stringify([...f.journal.rows.values()])).not.toMatch(
    /PRIVATE_API_CANARY|PRIVATE_HEADER_CANARY/,
  );
});
it("retries a journal failure idempotently without clearing or duplicating secrets", async () => {
  const f = settingsFixture();
  const hash = await f.migration.sourceDigest(1);
  f.journal.failSave = true;
  await expect(f.migration.stage("retry", 1, hash)).rejects.toThrow(
    "CONTROLLED_SQL_FAILURE",
  );
  expect(f.journal.rows.size).toBe(0);
  f.journal.failSave = false;
  expect(await f.migration.stage("retry", 1, hash)).toMatchObject({
    copied: 1,
    quarantined: 0,
  });
});
it("fences source drift and stale backend epochs before checkpoint publication", async () => {
  const f = settingsFixture();
  const hash = await f.migration.sourceDigest(1);
  const changed = providerSettings();
  changed.revision++;
  f.data.value = changed;
  await expect(f.migration.stage("drift", 1, hash)).rejects.toThrow(
    "SOURCE_CHANGED",
  );
  f.journal.epoch = 2;
  await expect(f.migration.stage("epoch", 1, hash)).rejects.toThrow(
    "MG01_FENCE_REQUIRED",
  );
  expect(f.journal.rows.size).toBe(0);
});

it("binds exact absent/null/empty source representations rather than normalizing their digests", async () => {
  const f = settingsFixture();
  f.data.value = undefined;
  const absent = await f.migration.sourceDigest(1);
  f.data.value = null;
  const cleared = await f.migration.sourceDigest(1);
  f.data.value = { schema_version: 1, providers: {} };
  const empty = await f.migration.sourceDigest(1);
  expect(new Set([absent, cleared, empty]).size).toBe(3);
  expect(await f.migration.stage("empty", 1, empty)).toMatchObject({
    copied: 0,
    quarantined: 0,
    sourceCount: 0,
  });
});
it("keeps checkpoints stable when storage reorders provider object properties", async () => {
  const f = settingsFixture();
  const source = providerSettings();
  const extra = { kind: "openai_compatible", config: providerConfig() };
  f.data.value = { ...source, providers: { ...source.providers, extra } };
  const digest = await f.migration.sourceDigest(1);
  const checkpoint = await f.migration.stage("order", 1, digest);
  f.data.value = { ...source, providers: { extra, ...source.providers } };
  expect(await f.migration.sourceDigest(1)).toBe(digest);
  expect(await f.migration.validate("order", 1, checkpoint)).toBe(true);
  expect(await f.migration.stage("order", 1, digest)).toEqual(checkpoint);
});
