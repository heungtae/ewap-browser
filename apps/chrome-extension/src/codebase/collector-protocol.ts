import { z } from "zod";
import {
  batchSchema,
  contextSchema,
  id,
  revision,
} from "@contextpilot/codebase-schema";
export const collectRequestSchema = z.strictObject({
  kind: z.literal("wca.codebase.collect"),
  requestId: z.string().uuid(),
  url: z.string().url().max(2048),
  batchId: id,
  context: contextSchema,
  expectedRevision: revision,
  scope: z.enum(["visible_only", "all_dom"]),
  deadline: revision,
});
export const cancelRequestSchema = z.strictObject({
  kind: z.literal("wca.codebase.cancel"),
  requestId: z.string().uuid(),
});
export const collectResponseSchema = z.union([
  z.strictObject({ ok: z.literal(true), batch: batchSchema }),
  z.strictObject({
    ok: z.literal(false),
    code: z.enum(["COLLECTOR_DENIED", "COLLECTOR_UNAVAILABLE"]),
  }),
]);
