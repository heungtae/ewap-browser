import { fail, isPlainObject } from "../security/validation.js";
import type {
  ProviderToolCall,
  ProviderToolDefinition,
} from "../providers/types.js";

export const elementAssessmentTool = (
  observationId: string,
  tools: ProviderToolDefinition[],
): ProviderToolDefinition => ({
  type: "function",
  function: {
    name: "assess_element",
    description:
      "The previous element proposal was rejected before execution. Interpret the current public control facts and actual executor/reader support. Propose one supported action with expected observation, or report unsupported/unknown. This never approves or executes. Do not invent methods, selectors, values or permissions.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        phase: { type: "string", enum: ["element"] },
        observation_id: { type: "string", enum: [observationId] },
        decision: {
          type: "string",
          enum: ["propose_action", "need_more_data", "unsupported", "unknown"],
        },
        rationale: { type: "string", minLength: 1, maxLength: 2000 },
        expected_observation: { type: "string", minLength: 1, maxLength: 2000 },
        evidence_ids: {
          type: "array",
          minItems: 1,
          maxItems: 1,
          items: { type: "string", enum: [observationId] },
        },
        action: {
          anyOf: tools
            .filter((t) => t.function.name.startsWith("propose_"))
            .map((tool) => ({
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string", enum: [tool.function.name] },
                arguments: tool.function.parameters,
              },
              required: ["name", "arguments"],
            })),
        },
      },
      required: [
        "phase",
        "observation_id",
        "decision",
        "rationale",
        "expected_observation",
        "evidence_ids",
      ],
    },
  },
});
export const parseElementAssessment = (
  call: ProviderToolCall,
  observationId: string,
  tools: ProviderToolDefinition[],
): { call?: ProviderToolCall; summary: string; needsData?: true } => {
  let value: unknown;
  try {
    value = JSON.parse(call.arguments);
  } catch {
    return fail("INVALID_ARGUMENT");
  }
  if (
    !isPlainObject(value) ||
    Object.keys(value).some(
      (key) =>
        ![
          "phase",
          "observation_id",
          "decision",
          "rationale",
          "expected_observation",
          "evidence_ids",
          "action",
        ].includes(key),
    ) ||
    value.phase !== "element" ||
    value.observation_id !== observationId ||
    !["propose_action", "need_more_data", "unsupported", "unknown"].includes(
      String(value.decision),
    ) ||
    typeof value.rationale !== "string" ||
    !value.rationale.trim() ||
    value.rationale.length > 2000 ||
    typeof value.expected_observation !== "string" ||
    !value.expected_observation.trim() ||
    value.expected_observation.length > 2000 ||
    !Array.isArray(value.evidence_ids) ||
    value.evidence_ids.length !== 1 ||
    value.evidence_ids[0] !== observationId
  )
    return fail("INVALID_ARGUMENT");
  if (value.decision !== "propose_action") {
    if (value.action !== undefined) return fail("INVALID_ARGUMENT");
    return {
      summary: value.rationale,
      ...(value.decision === "need_more_data"
        ? { needsData: true as const }
        : {}),
    };
  }
  const action = value.action;
  if (
    !isPlainObject(action) ||
    Object.keys(action).length !== 2 ||
    typeof action.name !== "string" ||
    !action.name.startsWith("propose_") ||
    !tools.some((tool) => tool.function.name === action.name) ||
    !isPlainObject(action.arguments)
  )
    return fail("INVALID_ARGUMENT");
  return {
    call: {
      id: call.id,
      name: action.name,
      arguments: JSON.stringify(action.arguments),
    },
    summary: value.rationale,
  };
};
