import { z } from "zod";
import { agentPreferencesSchema } from "./preferences.js";
export * from "./preferences.js";
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
const revision = z.number().int().nonnegative().safe();
export const providerWriteSchema = z.strictObject({
  kind: z.enum(["openai_compatible", "typesafe_jev"]),
  plugin_id: id,
  plugin_version: z.literal("1.0.0"),
  label: z.string().min(1).max(160),
  base_url: z.string().url().max(2048),
  model: z.string().min(1).max(128),
  wire_api: z.enum(["responses", "chat_completions"]),
  api_key_header: z.enum([
    "none",
    "authorization_bearer",
    "api-key",
    "x-goog-api-key",
  ]),
  api_key: z.string().max(4096),
  headers: z
    .array(
      z.strictObject({
        name: z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/),
        value: z.string().max(4096),
      }),
    )
    .max(64),
  timeout_ms: z.number().int().min(100).max(300000),
  enabled: z.boolean(),
  private_network_opt_in: z.boolean().default(false),
});
export const publicProviderSchema = providerWriteSchema
  .omit({ api_key: true, headers: true })
  .extend({
    has_api_key: z.boolean(),
    header_names: z.array(z.string().max(128)).max(64),
  });
export const settingsRolesSchema = z.strictObject({
  controller: z.union([id, z.null()]),
  controllerEnabled: z.boolean(),
  analyst: z.union([id, z.null()]),
});
export const settingsCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("settings.read") }),
  z.strictObject({
    kind: z.literal("settings.preferences.write"),
    revision,
    preferences: agentPreferencesSchema,
  }),
  z.strictObject({
    kind: z.literal("settings.provider.write"),
    revision,
    id,
    config: providerWriteSchema,
  }),
  z.strictObject({ kind: z.literal("settings.provider.remove"), revision, id }),
  z.strictObject({
    kind: z.literal("settings.roles.write"),
    revision,
    roles: settingsRolesSchema,
  }),
]);
export const settingsViewSchema = z.strictObject({
  revision,
  providers: z.record(id, publicProviderSchema),
  preferences: agentPreferencesSchema.optional(),
  roles: settingsRolesSchema,
  controllerFailure: z.literal("stop"),
  secretMode: z.enum(["session-only", "os-store"]),
  controllerReady: z.literal(false),
  analystReady: z.literal(false),
});
export const settingsResultSchema = z.union([
  z.strictObject({ ok: z.literal(true), state: settingsViewSchema }),
  z.strictObject({
    ok: z.literal(false),
    code: z.enum([
      "SETTINGS_INVALID",
      "SETTINGS_STALE",
      "SETTINGS_UNAVAILABLE",
    ]),
  }),
]);
export type ProviderWrite = z.infer<typeof providerWriteSchema>;
export type SettingsCommand = z.infer<typeof settingsCommandSchema>;
export type SettingsView = z.infer<typeof settingsViewSchema>;
