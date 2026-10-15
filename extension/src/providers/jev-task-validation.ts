import { fail, isPlainObject } from "../security/validation.js";
import { decisionPhases, type DecisionTask } from "./jev-types.js";
export const validateJevTask = (task: DecisionTask): void => {
  if (
    !decisionPhases.includes(task.phase) ||
    !isPlainObject(task.state) ||
    !isPlainObject(task.questions) ||
    Object.keys(task.questions).length < 1 ||
    Object.keys(task.questions).length > 16
  )
    return fail("INVALID_ARGUMENT");
  for (const [id, question] of Object.entries(task.questions)) {
    if (
      !/^[a-z][a-z0-9_]{0,63}$/.test(id) ||
      !isPlainObject(question) ||
      typeof question.instructions !== "string" ||
      !question.instructions.trim() ||
      question.instructions.length > 8000 ||
      Object.keys(question).some(
        (k) =>
          ![
            "type",
            "instructions",
            ...(question.type === "noul" ? [] : ["criteria"]),
          ].includes(k),
      )
    )
      return fail("INVALID_ARGUMENT");
    if (question.type === "choice") {
      if (
        !isPlainObject(question.criteria) ||
        Object.keys(question.criteria).length < 2 ||
        Object.keys(question.criteria).length > 64 ||
        Object.entries(question.criteria).some(
          ([k, v]) =>
            k.length < 1 ||
            k.length > 128 ||
            typeof v !== "string" ||
            !v.trim() ||
            v.length > 8000,
        )
      )
        return fail("INVALID_ARGUMENT");
    } else if (question.type === "score") {
      if (
        !Array.isArray(question.criteria) ||
        question.criteria.length < 1 ||
        question.criteria.length > 16 ||
        question.criteria.some(
          (v) => typeof v !== "string" || !v.trim() || v.length > 8000,
        )
      )
        return fail("INVALID_ARGUMENT");
    } else if (question.type !== "noul") return fail("INVALID_ARGUMENT");
  }
};
