import { z } from "zod";
import {
  nativeChoiceSchema,
  nativeSufficiencySchema,
  decisionResultSchema,
} from "@contextpilot/task-engine/decisions";
const score = z.strictObject({
  type: z.literal("score"),
  score: z.number().finite(),
  confidence: z.number().min(0).max(1),
  probabilities: z.record(z.string(), z.number().min(0).max(1)),
  legend: z.record(z.string(), z.string()),
});
export const nativeResponseSchema = z.strictObject({
  model: z.string().min(1).max(128),
  answers: z.record(
    z.string(),
    z.union([nativeChoiceSchema, nativeSufficiencySchema, score]),
  ),
  usage: decisionResultSchema.shape.usage,
});
export type Question =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string }
  | { type: "score"; instructions: string; criteria: string[] };
/** Same closed choice/score/noul and normalized-distribution checks as the legacy native parser. */
export function parseNativeResponse(
  input: unknown,
  questions: Record<string, Question>,
  model: string,
) {
  const value = nativeResponseSchema.parse(input);
  const exact = (actual: string[], expected: string[]) =>
    actual.length === expected.length &&
    expected.every((key) => actual.includes(key));
  if (
    value.model !== model ||
    !exact(Object.keys(value.answers), Object.keys(questions))
  )
    throw new Error("INVALID_NATIVE_ANSWERS_OR_MODEL");
  for (const [id, question] of Object.entries(questions)) {
    const answer = value.answers[id]!;
    if (answer.type !== question.type)
      throw new Error("INVALID_NATIVE_ANSWER_TYPE");
    if (answer.type === "noul") continue;
    const keys =
      question.type === "choice"
        ? Object.keys(question.criteria)
        : question.type === "score"
          ? question.criteria.map((_v, i) => String(i))
          : [];
    if (
      !exact(Object.keys(answer.probabilities), keys) ||
      Math.abs(
        Object.values(answer.probabilities).reduce((a, b) => a + b, 0) - 1,
      ) > 0.01
    )
      throw new Error("INVALID_NATIVE_DISTRIBUTION");
    if (
      answer.type === "choice" &&
      (!keys.includes(answer.choice) ||
        Object.values(answer.probabilities).some(
          (p) => p > answer.probabilities[answer.choice]! + 0.000001,
        ))
    )
      throw new Error("FOREIGN_NATIVE_CHOICE");
    if (
      answer.type === "score" &&
      question.type === "score" &&
      (!exact(Object.keys(answer.legend), keys) ||
        keys.some((key, i) => answer.legend[key] !== question.criteria[i]) ||
        Math.abs(
          answer.score -
            keys.reduce(
              (sum, key) => sum + Number(key) * answer.probabilities[key]!,
              0,
            ),
        ) > 0.01)
    )
      throw new Error("INVALID_NATIVE_SCORE");
  }
  return value;
}
export const nativeResponseJsonSchema = z.toJSONSchema(nativeResponseSchema);
