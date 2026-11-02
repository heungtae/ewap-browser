import { z } from "zod";
import {
  agentPreferencesSchema,
  publicProviderSchema,
  settingsRolesSchema,
  type ProviderWrite,
} from "../../../../packages/shared/src/settings-rpc.js";
export const settingsStateSchema = z
  .strictObject({
    schema: z.literal("wca.settings/v1"),
    installationId: z.string().uuid(),
    profileId: z.string().uuid(),
    revision: z.number().int().nonnegative().safe(),
    roles: settingsRolesSchema,
    preferences: agentPreferencesSchema.optional(),
    providers: z.record(
      z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
      publicProviderSchema
        .omit({ has_api_key: true })
        .extend({ credentialRef: z.string().max(256) }),
    ),
  })
  .refine((s) => Object.keys(s.providers).length <= 64, "PROVIDER_LIMIT");
export type SettingsState = z.infer<typeof settingsStateSchema>;
export interface SettingsPersistence {
  read(): Promise<SettingsState>;
  write(
    value: SettingsState,
    expected: number,
    guard: () => void,
  ): Promise<void>;
}
export function validateProvider(input: ProviderWrite) {
  const url = new URL(input.base_url);
  const host = url.hostname;
  const ipv4 = host.split(".").map(Number);
  const privateV4 =
    ipv4.length === 4 &&
    (ipv4[0] === 10 ||
      (ipv4[0] === 172 && ipv4[1]! >= 16 && ipv4[1]! <= 31) ||
      (ipv4[0] === 192 && ipv4[1] === 168));
  const loopback =
    host === "localhost" ||
    host === "[::1]" ||
    (ipv4.length === 4 && ipv4[0] === 127);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        (loopback || (privateV4 && input.private_network_opt_in)))
    ) ||
    (url.protocol === "https:" && privateV4 && !input.private_network_opt_in)
  )
    throw Error("SETTINGS_INVALID");
  const expected =
    input.kind === "typesafe_jev"
      ? "contextpilot.typesafe-jev"
      : "contextpilot.openai-compatible";
  if (
    input.plugin_id !== expected ||
    (input.api_key_header === "none" && input.api_key) ||
    new Set(input.headers.map((h) => h.name.toLowerCase())).size !==
      input.headers.length ||
    /[\r\n\0]/.test(input.api_key) ||
    input.headers.some((h) => /[\r\n\0]/.test(h.value))
  )
    throw Error("SETTINGS_INVALID");
}
export function validateRoles(state: SettingsState) {
  if (
    state.roles.controllerEnabled &&
    (!state.roles.controller ||
      !state.providers[state.roles.controller]?.enabled)
  )
    throw Error("SETTINGS_INVALID");
  for (const role of ["controller", "analyst"] as const) {
    const id = state.roles[role];
    if (id === null) continue;
    const provider = state.providers[id];
    if (
      !provider ||
      (role === "controller"
        ? provider.kind !== "typesafe_jev" ||
          !/^jev-\d+\.\d+\.\d+$/.test(provider.model)
        : provider.kind !== "openai_compatible" ||
          provider.wire_api !== "responses" ||
          !/^(?:openai\/)?gpt-[A-Za-z0-9._-]+$/.test(provider.model))
    )
      throw Error("SETTINGS_INVALID");
  }
}
