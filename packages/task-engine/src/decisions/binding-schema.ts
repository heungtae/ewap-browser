import { z } from "zod";
import { id, digestSchema } from "./schema.js";
const expected = {
  valueType: z.enum(["string", "number", "boolean", "date_range"]),
  unit: id.nullable(),
};
export const baseBindingSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("user_span"),
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    spanDigest: digestSchema,
    ...expected,
  }),
  z.strictObject({
    kind: z.literal("approved_input"),
    promptId: id,
    promptRevision: z.number().int().nonnegative(),
    ...expected,
  }),
  z.strictObject({
    kind: z.literal("observed_value"),
    ref: id,
    graphRevision: z.number().int().nonnegative(),
    evidenceRevision: z.number().int().nonnegative(),
    ...expected,
  }),
]);
export const argumentBindingSchema = z.union([
  baseBindingSchema,
  z.strictObject({
    kind: z.literal("derived_value"),
    transform: z.enum(["relative-day-v1", "sum-integers-v1"]),
    sources: z.array(baseBindingSchema).min(1).max(16),
    ...expected,
  }),
]);
export type ArgumentBinding = z.infer<typeof argumentBindingSchema>;
export const argumentBindingJsonSchema = z.toJSONSchema(argumentBindingSchema);
