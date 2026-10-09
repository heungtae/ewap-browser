import type { ProviderToolDefinition } from "../providers/types.js";

export const submitPlanTool = (
  capabilities: string[],
  revision: number,
  evidenceIds: string[],
): ProviderToolDefinition => ({
  type: "function",
  function: {
    name: "submit_plan",
    description:
      "Submit a grounded plan for user review. This neither approves nor executes actions. Every later action still requires its own existing approval and permission checks. Each step is one executable ACTION using exactly a supplied capability enum. Read tools, local verifiers, approval and report_goal_status are NOT action steps: preserve their observation/verification meaning in postcondition. Maximum 12 steps and 32768 argument characters. Unsupported steps are rejected, never removed. Replanning invalidates prior approval.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        request_revision: { type: "integer", enum: [revision] },
        goal: { type: "string", minLength: 1, maxLength: 2000 },
        evidence_ids: {
          type: "array",
          minItems: 1,
          maxItems: 32,
          items: { type: "string", enum: evidenceIds },
        },
        coverage_note: { type: "string", minLength: 1, maxLength: 2000 },
        provenance: { type: "string", minLength: 1, maxLength: 2000 },
        origin_diff: { type: "string", maxLength: 2000 },
        approval_scope: { type: "string", enum: ["single_step"] },
        steps: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              intent: { type: "string", minLength: 1, maxLength: 2000 },
              capability: { type: "string", enum: capabilities },
              target_evidence_id: {
                type: "string",
                description: "One supplied observation evidence ID.",
                enum: evidenceIds,
              },
              user_input: { type: "string", maxLength: 4096 },
              side_effects: {
                type: "array",
                maxItems: 8,
                items: { type: "string", maxLength: 2000 },
              },
              postcondition: { type: "string", minLength: 1, maxLength: 2000 },
            },
            required: ["intent", "capability", "postcondition"],
          },
        },
      },
      required: [
        "request_revision",
        "goal",
        "evidence_ids",
        "coverage_note",
        "provenance",
        "steps",
        "approval_scope",
      ],
    },
  },
});

export const goalCheckTool = (
  observationId: string,
): ProviderToolDefinition => ({
  type: "function",
  function: {
    name: "report_goal_status",
    description:
      "After execution results and fresh observation, report whether the original goal is completed, incomplete or unknown. Typed FAILED/UNKNOWN cannot become success. Further actions require new approvals; use available reads or submit_plan to replan instead when appropriate.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: {
          type: "string",
          enum: ["completed", "incomplete", "unknown"],
        },
        summary: { type: "string", minLength: 1, maxLength: 4000 },
        observation_id: { type: "string", enum: [observationId] },
      },
      required: ["status", "summary", "observation_id"],
    },
  },
});
