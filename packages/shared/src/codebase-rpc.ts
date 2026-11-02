import { z } from "zod";
import {
  projectionLeaseSchema,
  projectionErrorCodeSchema,
} from "@contextpilot/codebase-schema";
export const codebaseCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("codebase.attach"), version: z.literal(1) }),
  z.strictObject({
    kind: z.literal("codebase.offer"),
    lease: projectionLeaseSchema,
  }),
  z.strictObject({
    kind: z.literal("codebase.revoke"),
    leaseId: projectionLeaseSchema.shape.id,
  }),
  z.strictObject({
    kind: z.literal("codebase.reject"),
    requestId: z.string().uuid(),
    leaseId: projectionLeaseSchema.shape.id,
    code: projectionErrorCodeSchema,
  }),
]);
export type CodebaseCommand = z.infer<typeof codebaseCommandSchema>;
import {
  projectionRequestSchema,
  projectionCancelSchema,
} from "@contextpilot/codebase-schema";
export const codebaseAgentSchema = z.strictObject({
  kind: z.literal("codebase.agent"),
  major: z.literal(1),
  minor: z.literal(0),
  messageId: z.string().uuid(),
  connectionId: z.string().uuid(),
  connectionEpoch: z.number().int().positive(),
  installationId: z.string().min(1).max(128),
  profileId: z.string().min(1).max(128),
  sender: z.literal("agent"),
  sentAt: z.number().int().nonnegative(),
  deadline: z.number().int().nonnegative(),
  payloadDigest: z.string().regex(/^[a-f0-9]{64}$/),
  payload: z.union([projectionRequestSchema, projectionCancelSchema]),
});
