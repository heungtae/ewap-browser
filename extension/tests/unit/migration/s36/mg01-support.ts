import {
  SessionSecrets,
  type SecretStore,
} from "../../../../../apps/agent-server/src/settings/service.js";
import { Mg01SettingsMigration } from "../../../../../apps/agent-server/src/migration/mg01-settings.js";
import type { Mg01Persistence } from "../../../../../apps/agent-server/src/migration/mg01-journal.js";
import {
  mg01StageSchema,
  type Mg01Stage,
} from "../../../../../apps/agent-server/src/migration/mg01-types.js";
export function providerConfig(patch: Record<string, unknown> = {}) {
  return {
    plugin_id: "contextpilot.openai-compatible",
    plugin_version: "1.0.0",
    label: "Original provider",
    base_url: "https://provider.example.test/v1",
    model: "gpt-test",
    wire_api: "responses",
    api_key: "PRIVATE_API_CANARY_001",
    api_key_header: "authorization_bearer",
    headers: [{ name: "x-private", value: "PRIVATE_HEADER_CANARY_001" }],
    timeout_ms: 10000,
    enabled: true,
    ...patch,
  };
}
export function providerSettings() {
  return {
    schema_version: 2,
    revision: 4,
    active_provider: "primary",
    routing: { mode: "single", pre_dispatch_failure: "primary" },
    providers: {
      primary: { kind: "openai_compatible", config: providerConfig() },
    },
  };
}
export class MemorySettingsJournal implements Mg01Persistence {
  readonly rows = new Map<string, Mg01Stage>();
  epoch = 1;
  failSave = false;
  private key(profile: string, id: string) {
    return JSON.stringify([profile, id]);
  }
  assertEpoch(epoch: number) {
    if (epoch !== this.epoch) throw new Error("MG01_FENCE_REQUIRED");
  }
  load(profile: string, id: string) {
    return structuredClone(this.rows.get(this.key(profile, id)));
  }
  save(row: Mg01Stage) {
    this.assertEpoch(row.epoch);
    if (this.failSave) throw new Error("CONTROLLED_SQL_FAILURE");
    this.rows.set(
      this.key(row.profileGuard, row.migrationId),
      mg01StageSchema.parse(structuredClone(row)),
    );
  }
}
export function settingsFixture(store: SecretStore = new SessionSecrets()) {
  const data: { value: unknown } = { value: providerSettings() };
  const journal = new MemorySettingsJournal();
  let frozen = true;
  const source = {
    async assertFrozen(epoch: number) {
      if (epoch !== 1 || !frozen) throw new Error("SOURCE_FENCE");
    },
    async readProviderSettings() {
      return structuredClone(data.value);
    },
  };
  const profile = "a".repeat(64);
  return {
    data,
    journal,
    source,
    profile,
    secrets: store,
    migration: new Mg01SettingsMigration(journal, source, profile, store),
    unfreeze() {
      frozen = false;
    },
  };
}
