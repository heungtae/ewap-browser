import { fail, isPlainObject } from "../security/validation.js";
import type { DecisionQuestion, DecisionResponse } from "./jev-types.js";
const invalid = (): never =>
  fail("PROVIDER_UNAVAILABLE", "invalid native decision response");
const probability = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
const exact = (value: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(value).length === keys.length &&
  keys.every((k) => Object.hasOwn(value, k));
const distribution = (
  value: unknown,
  keys: string[],
): Record<string, number> => {
  if (
    !isPlainObject(value) ||
    !exact(value, keys) ||
    !Object.values(value).every(probability) ||
    Math.abs(
      Object.values(value).reduce<number>((n, v) => n + Number(v), 0) - 1,
    ) > 0.01
  )
    return invalid();
  return value as Record<string, number>;
};
export const parseJevResponse = (
  value: unknown,
  questions: Record<string, DecisionQuestion>,
  pinnedModel: string,
): DecisionResponse => {
  if (
    !isPlainObject(value) ||
    !exact(value, ["model", "answers", "usage"]) ||
    value.model !== pinnedModel ||
    !isPlainObject(value.answers) ||
    !exact(value.answers, Object.keys(questions)) ||
    !isPlainObject(value.usage) ||
    !exact(value.usage, ["input_tokens", "output_tokens"]) ||
    Object.values(value.usage).some(
      (n) => !Number.isSafeInteger(n) || Number(n) < 0,
    )
  )
    return invalid();
  for (const [id, question] of Object.entries(questions)) {
    const answer = value.answers[id];
    if (!isPlainObject(answer) || answer.type !== question.type)
      return invalid();
    if (question.type === "noul") {
      if (!exact(answer, ["type", "noul"]) || !probability(answer.noul))
        return invalid();
    } else {
      if (!probability(answer.confidence)) return invalid();
      const keys =
        question.type === "choice"
          ? Object.keys(question.criteria)
          : question.criteria.map((_v, i) => String(i));
      const probabilities = distribution(answer.probabilities, keys);
      if (question.type === "choice") {
        if (
          !exact(answer, ["type", "choice", "confidence", "probabilities"]) ||
          typeof answer.choice !== "string" ||
          !keys.includes(answer.choice) ||
          Object.values(probabilities).some(
            (p) => p > probabilities[answer.choice as string]! + 0.000001,
          )
        )
          return invalid();
      } else {
        if (
          !exact(answer, [
            "type",
            "score",
            "confidence",
            "probabilities",
            "legend",
          ]) ||
          !isPlainObject(answer.legend) ||
          !exact(answer.legend, keys) ||
          keys.some(
            (k, i) =>
              (answer.legend as Record<string, unknown>)[k] !==
              question.criteria[i],
          ) ||
          typeof answer.score !== "number" ||
          !Number.isFinite(answer.score) ||
          Math.abs(
            answer.score -
              keys.reduce((n, k) => n + Number(k) * probabilities[k]!, 0),
          ) > 0.01
        )
          return invalid();
      }
    }
  }
  return value as DecisionResponse;
};
export const acceptedChoice = (
  response: { answers: DecisionResponse["answers"] },
  id: string,
  floor = 0.9,
): string | undefined => {
  const answer = response.answers[id];
  return answer?.type === "choice" &&
    answer.confidence >= floor &&
    answer.probabilities[answer.choice]! >= floor
    ? answer.choice
    : undefined;
};
