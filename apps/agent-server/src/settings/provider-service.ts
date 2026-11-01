import {
  settingsCommandSchema,
  settingsViewSchema,
  type SettingsCommand,
  type SettingsView,
} from "../../../../packages/shared/src/settings-rpc.js";
import {
  settingsStateSchema,
  validateProvider,
  validateRoles,
  type SettingsPersistence,
  type SettingsState,
} from "./provider-state.js";
import {
  stageMaterial,
  readMaterial,
  publicRecord,
  assertPublicMetadata,
} from "./provider-secrets.js";
import type { SecretStore } from "./service.js";
export class ProviderSettingsService {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private persistence: SettingsPersistence,
    private secrets: SecretStore,
  ) {}
  request(raw: unknown, guard: () => void = () => {}) {
    const pending = this.queue.then(async () => {
      try {
        guard();
        const command = settingsCommandSchema.parse(raw);
        let state = settingsStateSchema.parse(await this.persistence.read());
        if (command.kind !== "settings.read")
          state = await this.mutate(state, command, guard);
        const view = await this.project(state);
        guard();
        return { ok: true as const, state: view };
      } catch (error) {
        return {
          ok: false as const,
          code:
            error instanceof Error && error.message === "SETTINGS_STALE"
              ? ("SETTINGS_STALE" as const)
              : error instanceof Error &&
                  error.message === "SETTINGS_UNAVAILABLE"
                ? ("SETTINGS_UNAVAILABLE" as const)
                : ("SETTINGS_INVALID" as const),
        };
      }
    });
    this.queue = pending.catch(() => undefined);
    return pending;
  }
  private async project(state: SettingsState): Promise<SettingsView> {
    await assertPublicMetadata(state, this.secrets);
    const providers: SettingsView["providers"] = {};
    for (const [id, record] of Object.entries(state.providers))
      providers[id] = publicRecord(
        record,
        !!(await readMaterial(this.secrets, state, id, record)).apiKey,
      );
    return settingsViewSchema.parse({
      revision: state.revision,
      providers,
      roles: state.roles,
      controllerFailure: "stop",
      secretMode: this.secrets.mode,
      controllerReady: false,
      analystReady: false,
    });
  }
  private async mutate(
    state: SettingsState,
    command: Exclude<SettingsCommand, { kind: "settings.read" }>,
    guard: () => void,
  ) {
    if (command.revision !== state.revision) throw Error("SETTINGS_STALE");
    const next = structuredClone(state);
    let staged: string | undefined;
    const obsolete: string[] = [];
    try {
      if (command.kind === "settings.provider.write") {
        validateProvider(command.config);
        if (
          !next.providers[command.id] &&
          Object.keys(next.providers).length >= 64
        )
          throw Error("SETTINGS_INVALID");
        const previous = next.providers[command.id];
        if (previous) obsolete.push(previous.credentialRef);
        guard();
        staged = await stageMaterial(
          this.secrets,
          state,
          command.id,
          command.config,
        );
        const { api_key: _key, headers, ...metadata } = command.config;
        if (!command.config.enabled && next.roles.controller === command.id)
          next.roles.controllerEnabled = false;
        next.providers[command.id] = {
          ...metadata,
          header_names: headers.map((h) => h.name),
          credentialRef: staged,
        };
      } else if (command.kind === "settings.provider.remove") {
        const previous = next.providers[command.id];
        if (!previous) throw Error("SETTINGS_INVALID");
        obsolete.push(previous.credentialRef);
        delete next.providers[command.id];
        for (const role of ["controller", "analyst"] as const)
          if (next.roles[role] === command.id) next.roles[role] = null;
        if (!next.roles.controller) next.roles.controllerEnabled = false;
      } else next.roles = command.roles;
      validateRoles(next);
      next.revision++;
      const parsed = settingsStateSchema.parse(next);
      if (Buffer.byteLength(JSON.stringify(parsed)) > 128 * 1024)
        throw Error("SETTINGS_INVALID");
      await assertPublicMetadata(parsed, this.secrets);
      guard();
      await this.persistence.write(parsed, state.revision, guard);
    } catch (error) {
      if (staged) {
        const retained = await this.persistence.read().then(
          (current) =>
            Object.values(current.providers).some(
              (record) => record.credentialRef === staged,
            ),
          () => true,
        );
        if (!retained)
          await this.secrets.write(staged, "").catch(() => undefined);
      }
      throw error;
    }
    for (const ref of obsolete)
      await this.secrets.write(ref, "").catch(() => {
        throw Error("SETTINGS_UNAVAILABLE");
      });
    return next;
  }
}
