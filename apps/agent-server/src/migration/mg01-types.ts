import { z } from "zod";
import { providerId } from "./mg01-source.js";
const hex = z.string().regex(/^[a-f0-9]{64}$/);
export const publicProviderSchema = z.strictObject({
  providerId,
  kind: z.enum(["openai_compatible", "typesafe_jev"]),
  label: z.string().min(1).max(160),
  endpoint: z.string().url(),
  model: z.string().min(1).max(128),
  wireApi: z.enum(["responses", "chat_completions"]),
  auth: z.enum(["none", "authorization_bearer", "api-key", "x-goog-api-key"]),
  headerNames: z.array(z.string()),
  timeoutMs: z.number().int(),
  sourceEnabled: z.boolean(),
  sourcePrivateNetworkOptIn: z.boolean(),
  enabled: z.literal(false),
  ready: z.literal(false),
  candidateRole: z.enum(["controller", "analyst"]).optional(),
  repair: z.enum(["DISABLED", "ROLE_REQUIRES_REPAIR"]).optional(),
  credentialRef: z.strictObject({ identity: hex, hasMaterial: z.boolean() }),
});
export const mg01ConversionSchema = z
  .strictObject({
    schema: z.literal("wca.mg01-settings/v1"),
    controllerFailure: z.literal("stop"),
    secretMode: z.enum(["session-only", "os-store"]),
    records: z.array(publicProviderSchema).max(64),
    quarantine: z
      .array(
        z.strictObject({
          sourceIndex: z.number().int().nonnegative(),
          reason: z.enum([
            "INVALID_CONTAINER",
            "INVALID_PROVIDER",
            "SECRET_REQUIRES_REPAIR",
            "SENSITIVE_PUBLIC_METADATA",
          ]),
        }),
      )
      .max(64),
    sourceCount: z.number().int().nonnegative().max(64),
  })
  .refine(
    (value) =>
      value.records.length + value.quarantine.length === value.sourceCount,
  );
export type Mg01Conversion = z.infer<typeof mg01ConversionSchema>;
export type PublicMigratedProvider = z.infer<typeof publicProviderSchema>;
export const mg01StageSchema = z.strictObject({
  schema: z.literal("wca.mg01-stage/v1"),
  migrationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  profileGuard: hex,
  epoch: z.number().int().positive().safe(),
  conversion: mg01ConversionSchema,
  checkpoint: z.strictObject({
    sourceDigest: hex,
    targetDigest: hex,
    sourceCount: z.number().int().nonnegative(),
    copied: z.number().int().nonnegative(),
    quarantined: z.number().int().nonnegative(),
  }),
});
export type Mg01Stage = z.infer<typeof mg01StageSchema>;
