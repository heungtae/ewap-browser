import { z } from "zod";
import { createHash } from "node:crypto";
const legacyConfig = z.object({
  base_url: z.string().url().max(2048),
  model: z.string().min(1).max(128),
  wire_api: z.enum(["responses", "chat_completions"]),
  enabled: z.boolean(),
  api_key_header: z.enum([
    "none",
    "authorization_bearer",
    "api-key",
    "x-goog-api-key",
  ]),
});
export interface RoleCandidate {
  providerId: string;
  role: "controller" | "analyst";
  endpoint: string;
  model: string;
  wireApi: "native" | "responses";
  enabled: false;
  ready: false;
}
export function migrateProviderRoles(input: unknown) {
  const outer = z
    .object({
      schema_version: z.union([z.literal(1), z.literal(2)]),
      providers: z.record(z.string(), z.unknown()),
      active_provider: z.string().optional(),
      routing: z
        .object({ decision_provider: z.string().optional() })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .parse(input);
  const candidates: RoleCandidate[] = [];
  const repair: { providerId: string; reason: string }[] = [];
  for (const [providerId, raw] of Object.entries(outer.providers)) {
    const record =
      outer.schema_version === 1
        ? { kind: "openai_compatible", config: raw }
        : raw;
    const parsed = z
      .object({ kind: z.string(), config: legacyConfig })
      .safeParse(record);
    if (!parsed.success) {
      repair.push({ providerId, reason: "INVALID_PROVIDER" });
      continue;
    }
    const { kind, config } = parsed.data;
    const url = new URL(config.base_url);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      repair.push({ providerId, reason: "INVALID_ENDPOINT" });
      continue;
    }
    const controller =
      providerId === outer.routing?.decision_provider &&
      kind === "typesafe_jev" &&
      /^jev-\d+\.\d+\.\d+$/.test(config.model);
    const analyst =
      providerId === outer.active_provider &&
      kind === "openai_compatible" &&
      /^(?:openai\/)?gpt-[A-Za-z0-9._-]+$/.test(config.model) &&
      config.wire_api === "responses";
    if (!config.enabled || (!controller && !analyst)) {
      repair.push({
        providerId,
        reason: !config.enabled
          ? "PROVIDER_DISABLED"
          : "PROVIDER_REQUIRES_REPAIR",
      });
      continue;
    }
    candidates.push({
      providerId,
      role: controller ? "controller" : "analyst",
      endpoint: config.base_url,
      model: config.model,
      wireApi: controller ? "native" : "responses",
      enabled: false,
      ready: false,
    });
  }
  return {
    schema: "wca.settings/v1" as const,
    controllerFailure: "stop" as const,
    candidates,
    repair,
    // Local-only original records, including invalid/disabled providers, remain available for repair/export.
    archive: structuredClone(input),
  };
}
export function credentialIdentity(input: {
  providerId: string;
  endpoint: string;
  kind: "controller" | "analyst";
  auth: string;
  credentialBoundary: string;
}): string {
  const parsed = z
    .strictObject({
      providerId: z.string().min(1).max(128),
      endpoint: z.string().url(),
      kind: z.enum(["controller", "analyst"]),
      auth: z.string().min(1).max(64),
      credentialBoundary: z.string().min(1).max(128),
    })
    .parse(input);
  const url = new URL(parsed.endpoint);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw new Error("PROVIDER_IDENTITY");
  return createHash("sha256")
    .update(
      JSON.stringify([
        parsed.providerId,
        url.href,
        parsed.kind,
        parsed.auth,
        parsed.credentialBoundary,
      ]),
    )
    .digest("hex");
}
