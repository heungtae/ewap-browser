import { providerManagementState } from "./provider-public-management.js";
import { publicProviders } from "./provider-public-state.js";
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
import {
  decodeProviderState,
  usableJev,
  validateRouting,
  type ProviderSettingsState,
} from "./provider-state.js";
export type { ProviderSettingsState } from "./provider-state.js";
export type SettingsStorage = {
  read(): Promise<unknown>;
  write(state: ProviderSettingsState): Promise<void>;
};

export class ProviderSettings {
  private writes: Promise<unknown> = Promise.resolve();
  public constructor(private readonly storage: SettingsStorage) {}
  private mutate(
    edit: (state: ProviderSettingsState) => void,
    revision?: number,
  ): Promise<void> {
    const write = this.writes.then(async () => {
      const state = await this.loadPrivate();
      if (revision !== undefined && state.revision !== revision)
        fail("INVALID_ARGUMENT", "stale settings revision");
      edit(state);
      state.revision++;
      await this.storage.write(state);
    });
    this.writes = write.catch(() => undefined);
    return write;
  }
  public save(id: string, config: ProviderConfig): Promise<void> {
    return this.saveWriteOnly(id, config);
  }
  public saveWriteOnly(
    id: string,
    input: unknown,
    revision?: number,
  ): Promise<void> {
    providerIdentifier(id);
    return this.mutate((state) => {
      const config = mergeWriteOnlyProvider(state.providers[id]?.config, input);
      validateProviderConfig(config);
      const kind = config.kind ?? "openai_compatible";
      if (state.active_provider === id && kind !== "openai_compatible")
        fail("INVALID_ARGUMENT", "reassign primary before changing kind");
      if (
        state.routing.mode === "jev" &&
        state.routing.decision_provider === id &&
        kind !== "typesafe_jev"
      )
        fail("INVALID_ARGUMENT", "disable routing before changing kind");
      state.providers[id] = { kind, config: { ...config, kind } };
      if (!state.active_provider && kind === "openai_compatible")
        state.active_provider = id;
    }, revision);
  }
  public async list(): Promise<Record<string, PublicProviderConfig>> {
    const state = await this.loadPrivate();
    return publicProviders(state);
  }

  public async resolve(id: string): Promise<ProviderConfig> {
    const record = (await this.loadPrivate()).providers[id];
    if (!record) return fail("PROVIDER_NOT_CONFIGURED");
    validateProviderConfig(record.config);
    return structuredClone(record.config);
  }
  public async active(): Promise<ProviderConfig> {
    const state = await this.loadPrivate();
    const record = state.active_provider
      ? state.providers[state.active_provider]
      : undefined;
    if (
      !record ||
      record.kind !== "openai_compatible" ||
      !record.config.enabled
    )
      return fail("PROVIDER_NOT_CONFIGURED");
    return structuredClone(record.config);
  }
  public setActive(id: string, revision?: number): Promise<void> {
    return this.mutate((state) => {
      if (
        state.providers[id]?.kind !== "openai_compatible" ||
        !state.providers[id]?.config.enabled
      )
        fail("PROVIDER_NOT_CONFIGURED");
      state.active_provider = id;
    }, revision);
  }
  public setRouting(value: unknown, revision?: number): Promise<void> {
    const routing = validateRouting(value);
    return this.mutate((state) => {
      if (
        routing.decision_provider &&
        state.providers[routing.decision_provider]?.kind !== "typesafe_jev"
      )
        fail("INVALID_ARGUMENT");
      state.routing = routing;
    }, revision);
  }
  public remove(
    id: string,
    deleteSecret: boolean,
    revision?: number,
  ): Promise<void> {
    return this.mutate((state) => {
      const record = state.providers[id] ?? fail("PROVIDER_NOT_CONFIGURED");
      if (
        state.routing.mode === "jev" &&
        [state.active_provider, state.routing.decision_provider].includes(id)
      )
        fail(
          "INVALID_ARGUMENT",
          "reassign roles or disable routing before removal",
        );
      if (deleteSecret) delete state.providers[id];
      else if (isPlainObject(record.config)) record.config.enabled = false;
      if (state.active_provider === id) delete state.active_provider;
    }, revision);
  }
  public async roles() {
    const state = await this.loadPrivate();
    const primary = state.active_provider
      ? state.providers[state.active_provider]
      : undefined;
    if (
      !primary ||
      primary.kind !== "openai_compatible" ||
      !primary.config.enabled
    )
      return fail("PROVIDER_NOT_CONFIGURED");
    const decision =
      state.routing.mode === "jev" && state.routing.decision_provider
        ? usableJev(state.providers[state.routing.decision_provider])
        : undefined;
    return {
      primary: structuredClone(primary.config),
      primaryId: state.active_provider!,
      decision,
      decisionId: decision ? state.routing.decision_provider : undefined,
      routing: state.routing,
      revision: state.revision,
    };
  }
  public async management() {
    return providerManagementState(await this.loadPrivate());
  }
  public async publicState() {
    const state = await this.loadPrivate();
    return {
      providers: publicProviders(state),
      ...providerManagementState(state),
    };
  }
  public async exportPublic() {
    const state = await this.loadPrivate();
    const providers = publicProviders(state);
    const hasJev = Object.values(state.providers).some(
      (p) => p.kind === "typesafe_jev",
    );
    if (!hasJev)
      for (const config of Object.values(providers)) delete config.kind;
    return {
      schema_version: hasJev ? 2 : 1,
      providers,
      ...(state.active_provider
        ? { active_provider: state.active_provider }
        : {}),
    };
  }
  private async loadPrivate(): Promise<ProviderSettingsState> {
    return decodeProviderState(await this.storage.read());
  }
}
