import { ProviderRegistry } from "./registry.js";
import { CoreProviderTransport } from "./transport.js";
import { ProviderSettings } from "../settings/provider-settings.js";
import { fail, isPlainObject } from "../security/validation.js";
import type { NormalizedProviderRequest, ProviderConfig } from "./types.js";

export type ProviderRuntimeStorage = {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
};

export class ProviderRuntime {
  public readonly registry = new ProviderRegistry();
  private readonly settings: ProviderSettings;
  public constructor(
    storage: ProviderRuntimeStorage,
    private readonly transport = new CoreProviderTransport(),
  ) {
    this.settings = new ProviderSettings({
      read: async () =>
        (await storage.get("provider_settings")).provider_settings,
      write: async (state) => storage.set({ provider_settings: state }),
    });
  }

  public async handle(
    kind: string,
    payload: unknown,
  ): Promise<Record<string, unknown>> {
    if (kind === "PROVIDER_LIST")
      return {
        ok: true,
        plugins: this.registry.snapshot(),
        providers: await this.settings.list(),
      };
    if (kind === "PLUGIN_INSTALL") {
      const installed = this.registry.install(payload);
      return { ok: true, plugin: installed };
    }
    if (kind === "PLUGIN_SET_ENABLED") {
      const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
      if (
        typeof value.plugin_id !== "string" ||
        typeof value.enabled !== "boolean"
      )
        fail("INVALID_ARGUMENT");
      this.registry.setEnabled(
        value.plugin_id as string,
        value.enabled as boolean,
      );
      await this.settings.setEnabledByPlugin(
        value.plugin_id as string,
        value.enabled as boolean,
      );
      return { ok: true };
    }
    if (kind === "PROVIDER_SAVE") {
      const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
      if (typeof value.id !== "string" || !isPlainObject(value.config))
        fail("INVALID_ARGUMENT");
      await this.settings.save(
        value.id as string,
        value.config as unknown as ProviderConfig,
      );
      return { ok: true, providers: await this.settings.list() };
    }
    if (kind === "PROVIDER_EXPORT")
      return { ok: true, export: await this.settings.exportPublic() };
    if (kind === "PROVIDER_TEST") {
      const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
      if (typeof value.id !== "string" || !isPlainObject(value.request))
        fail("INVALID_ARGUMENT");
      const config = await this.settings.resolve(value.id as string);
      const resolved = this.registry.resolve(
        config.plugin_id,
        config.plugin_version,
      );
      const result = await this.transport.send(
        config,
        resolved.adapter,
        value.request as unknown as NormalizedProviderRequest,
      );
      return { ok: true, status: result.status };
    }
    if (kind === "CHAT_SEND") {
      const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
      if (
        typeof value.prompt !== "string" ||
        value.prompt.length === 0 ||
        value.prompt.length > 8_000
      )
        fail("INVALID_ARGUMENT");
      const config = await this.settings.active();
      const resolved = this.registry.resolve(
        config.plugin_id,
        config.plugin_version,
      );
      const result = await this.transport.send(config, resolved.adapter, {
        wire_api: config.wire_api,
        model: config.model,
        messages: [{ role: "user", content: value.prompt as string }],
        stream: false,
      });
      if (!result.body) fail("PROVIDER_UNAVAILABLE");
      const text = await new Response(result.body).text();
      let response: unknown;
      try {
        response = JSON.parse(text);
      } catch {
        fail("PROVIDER_UNAVAILABLE");
      }
      const responseObject = isPlainObject(response)
        ? response
        : fail("PROVIDER_UNAVAILABLE");
      const choices = responseObject.choices;
      const first = Array.isArray(choices) ? choices[0] : undefined;
      const message =
        isPlainObject(first) && isPlainObject(first.message)
          ? first.message.content
          : undefined;
      const output =
        typeof message === "string"
          ? message
          : typeof responseObject.output_text === "string"
            ? responseObject.output_text
            : undefined;
      if (!output) fail("PROVIDER_UNAVAILABLE");
      return { ok: true, message: output };
    }
    return fail("INVALID_ARGUMENT");
  }
}
