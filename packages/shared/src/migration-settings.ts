import { z } from "zod";
import {
  AUTH_SCHEMES,
  WIRE_APIS,
} from "../../../extension/src/providers/types.js";
export const providerId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/);
export const configSchema = z.strictObject({
  kind: z.enum(["openai_compatible", "typesafe_jev"]).optional(),
  plugin_id: providerId,
  plugin_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  label: z.string().min(1).max(160),
  base_url: z.string().url().max(2048),
  model: z.string().min(1).max(128),
  wire_api: z.enum(WIRE_APIS),
  api_key_header: z.enum(AUTH_SCHEMES),
  api_key: z.string().max(4096),
  headers: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(128),
        value: z.string().max(4096),
      }),
    )
    .max(64),
  timeout_ms: z.number().int().min(100).max(300000),
  enabled: z.boolean(),
  private_network_opt_in: z.boolean().optional(),
});
export const settingsSourceSchema = z
  .strictObject({
    schema_version: z.union([z.literal(1), z.literal(2)]),
    providers: z.record(z.string(), z.unknown()),
    active_provider: providerId.optional(),
    revision: z.number().int().nonnegative().safe().optional(),
    routing: z
      .strictObject({
        mode: z.enum(["single", "jev"]),
        decision_provider: providerId.optional(),
        pre_dispatch_failure: z.enum(["primary", "stop"]),
      })
      .optional(),
  })
  .refine(
    (value) =>
      Object.keys(value.providers).length <= 64 &&
      (value.schema_version === 1
        ? value.revision === undefined && value.routing === undefined
        : value.revision !== undefined && value.routing !== undefined),
  );
export const recordSchema = z.strictObject({
  kind: z.enum(["openai_compatible", "typesafe_jev"]),
  config: configSchema,
});
export function parseSettingsSource(raw: unknown) {
  if (raw === undefined) return undefined;
  const source = settingsSourceSchema.parse(raw);
  for (const [id, value] of Object.entries(source.providers)) {
    providerId.parse(id);
    if (source.schema_version === 1) configSchema.parse(value);
    else recordSchema.parse(value);
  }
  return source;
}
