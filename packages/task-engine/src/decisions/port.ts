import { z } from "zod";
import {
  digestSchema,
  revision,
  decisionFrameSchema,
  type DecisionFrame,
} from "./schema.js";
export const nativeChoiceSchema = z.strictObject({
  type: z.literal("choice"),
  choice: z.string().min(1).max(128),
  confidence: z.number().min(0).max(1),
  probabilities: z.record(z.string(), z.number().min(0).max(1)),
});
export const nativeSufficiencySchema = z.strictObject({
  type: z.literal("noul"),
  noul: z.number().min(0).max(1),
});
export const decisionResultSchema = z.strictObject({
  protocol: z.literal("wca.task/v1"),
  frameDigest: digestSchema,
  candidateDigest: digestSchema,
  templateVersion: z.literal("controller-v1"),
  model: z.string().min(1).max(128),
  modelRevision: revision,
  context: decisionFrameSchema.shape.context,
  answers: z.strictObject({
    decision: nativeChoiceSchema,
    evidence_sufficient: nativeSufficiencySchema,
  }),
  usage: z.strictObject({ input_tokens: revision, output_tokens: revision }),
});
export type DecisionResult = z.infer<typeof decisionResultSchema>;
export interface ControllerPort {
  evaluate(frame: DecisionFrame, signal?: AbortSignal): Promise<DecisionResult>;
}
export const decisionResultJsonSchema = z.toJSONSchema(decisionResultSchema);
