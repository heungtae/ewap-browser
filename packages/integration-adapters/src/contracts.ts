import { z } from "zod";
import { id, revision, toolIdSchema } from "@contextpilot/tool-registry";
export const originSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value;
  }, "EXACT_HTTPS_ORIGIN_REQUIRED");
export const grantSchema = z.strictObject({
  clientId: id,
  revision,
  profileId: id,
  origins: z.array(originSchema).min(1).max(16),
  tabIds: z.array(revision).min(1).max(16),
  modes: z
    .array(z.enum(["ask", "act"]))
    .min(1)
    .max(2),
  tools: z.array(toolIdSchema).max(32),
  externalController: z.boolean(),
  expiresAt: revision,
});
export type Grant = z.infer<typeof grantSchema>;
export const scopeSchema = z.strictObject({
  profileId: id,
  origin: originSchema,
  tabId: revision,
  mode: z.enum(["ask", "act"]),
});
export type Scope = z.infer<typeof scopeSchema>;
export function assertScope(grant: Grant, scope: Scope, now: number): void {
  grantSchema.parse(grant);
  scopeSchema.parse({
    profileId: scope.profileId,
    origin: scope.origin,
    tabId: scope.tabId,
    mode: scope.mode,
  });
  if (
    now >= grant.expiresAt ||
    scope.profileId !== grant.profileId ||
    !grant.origins.includes(scope.origin) ||
    !grant.tabIds.includes(scope.tabId) ||
    !grant.modes.includes(scope.mode)
  )
    throw new Error("MCP_SCOPE_DENIED");
}
export const executeSchema = scopeSchema.extend({
  requestId: id,
  objective: z.string().min(1).max(2000),
});
export const statusSchema = z.strictObject({ taskHandle: z.string().uuid() });
export const stepSchema = statusSchema.extend({
  callId: id,
  input: z.unknown(),
});
export const backendCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("catalog") }),
  z.strictObject({
    kind: z.literal("call"),
    name: z.string().min(1).max(128),
    arguments: z.unknown(),
  }),
]);
export interface BackendPort {
  request(input: z.infer<typeof backendCommandSchema>): Promise<unknown>;
  close(): void;
}
export function safeCode(error: unknown): string {
  return error instanceof Error && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.message)
    ? error.message
    : "MCP_INVALID_REQUEST";
}
