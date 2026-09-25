import { fail, isPlainObject } from "../security/validation.js";
import type {
  ProviderConfig,
  PublicProviderConfig,
} from "../providers/types.js";
import { mergeWriteOnlyProvider } from "./provider-secret-write.js";
import {
  providerIdentifier,
  validateProviderConfig,
} from "./provider-config-validation.js";

export type ProviderSettingsState = {
  schema_version: 1;
  providers: Record<string, ProviderConfig>;
  active_provider?: string;
};
export type SettingsStorage = {
  read(): Promise<unknown>;
  write(state: ProviderSettingsState): Promise<void>;
};
const initial = (): ProviderSettingsState => ({
  schema_version: 1,
  providers: {},
});

export class ProviderSettings {
  public constructor(private readonly storage: SettingsStorage) {}

  public async save(id: string, config: ProviderConfig): Promise<void> {
    providerIdentifier(id);
    validateProviderConfig(config);
    const state = await this.loadPrivate();
    state.providers[id] = structuredClone(config);
    if (!state.active_provider) state.active_provider = id;
    await this.storage.write(state);
  }

  public async saveWriteOnly(id: string, input: unknown): Promise<void> {
    providerIdentifier(id);
    const state = await this.loadPrivate();
    const config = mergeWriteOnlyProvider(state.providers[id], input);
    validateProviderConfig(config);
    state.providers[id] = structuredClone(config);
    if (!state.active_provider) state.active_provider = id;
    await this.storage.write(state);
  }

  public async list(): Promise<Record<string, PublicProviderConfig>> {
    const state = await this.loadPrivate();
    return Object.fromEntries(
      Object.entries(state.providers).map(([id, config]) => [
        id,
        this.redact(config),
      ]),
    );
  }

  public async resolve(id: string): Promise<ProviderConfig> {
    const config = (await this.loadPrivate()).providers[id];
    return config ? structuredClone(config) : fail("PROVIDER_NOT_CONFIGURED");
  }

  public async active(): Promise<ProviderConfig> {
    const state = await this.loadPrivate();
    if (!state.active_provider) fail("PROVIDER_NOT_CONFIGURED");
    return this.resolve(state.active_provider as string);
  }

  public async setActive(id: string): Promise<void> {
    const state = await this.loadPrivate();
    if (!state.providers[id]?.enabled) fail("PROVIDER_NOT_CONFIGURED");
    state.active_provider = id;
    await this.storage.write(state);
  }

  public async disableByPlugin(pluginId: string): Promise<void> {
    const state = await this.loadPrivate();
    for (const config of Object.values(state.providers))
      if (config.plugin_id === pluginId) config.enabled = false;
    await this.storage.write(state);
  }

  public async setEnabledByPlugin(
    pluginId: string,
    enabled: boolean,
  ): Promise<void> {
    const state = await this.loadPrivate();
    for (const config of Object.values(state.providers))
      if (config.plugin_id === pluginId) config.enabled = enabled;
    await this.storage.write(state);
  }

  public async remove(id: string, deleteSecret: boolean): Promise<void> {
    const state = await this.loadPrivate();
    const config = state.providers[id] ?? fail("PROVIDER_NOT_CONFIGURED");
    if (deleteSecret) delete state.providers[id];
    else config.enabled = false;
    if (state.active_provider === id) delete state.active_provider;
    await this.storage.write(state);
  }

  public async removeByPlugin(
    pluginId: string,
    deleteSecrets: boolean,
  ): Promise<void> {
    const state = await this.loadPrivate();
    for (const [id, config] of Object.entries(state.providers)) {
      if (config.plugin_id !== pluginId) continue;
      if (deleteSecrets) delete state.providers[id];
      else config.enabled = false;
      if (state.active_provider === id) delete state.active_provider;
    }
    await this.storage.write(state);
  }

  public async exportPublic(): Promise<{
    schema_version: 1;
    providers: Record<string, PublicProviderConfig>;
    active_provider?: string;
  }> {
    const state = await this.loadPrivate();
    return {
      schema_version: 1,
      providers: await this.list(),
      ...(state.active_provider
        ? { active_provider: state.active_provider }
        : {}),
    };
  }

  private redact(config: ProviderConfig): PublicProviderConfig {
    const { api_key, headers, ...publicConfig } = config;
    return {
      ...publicConfig,
      has_api_key: api_key.length > 0,
      header_names: headers.map((header) => header.name),
    };
  }

  private async loadPrivate(): Promise<ProviderSettingsState> {
    const value = await this.storage.read();
    if (value === undefined || value === null) return initial();
    if (
      !isPlainObject(value) ||
      value.schema_version !== 1 ||
      !isPlainObject(value.providers) ||
      Object.keys(value).some(
        (key) =>
          !["schema_version", "providers", "active_provider"].includes(key),
      )
    )
      return fail("INVALID_ARGUMENT");
    const state = structuredClone(value) as ProviderSettingsState;
    for (const [id, config] of Object.entries(state.providers)) {
      providerIdentifier(id);
      validateProviderConfig(config);
    }
    if (
      state.active_provider !== undefined &&
      (typeof state.active_provider !== "string" ||
        !state.providers[state.active_provider])
    )
      fail("INVALID_ARGUMENT");
    return state;
  }
}
