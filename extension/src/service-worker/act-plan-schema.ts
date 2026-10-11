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
              user_input: {
                type: "string",
                maxLength: 4096,
                description:
                  "Optional exact execution input, bound to the later proposal. For propose_page_api copy the registered option_id (for example high), never its display label (High). For other input actions use the exact proposed value. Omit for actions without input.",
              },
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
  evidenceRefs: string[] = [],
): ProviderToolDefinition => ({
  type: "function",
  function: {
    name: "report_goal_status",
    description:
      "After execution results and fresh observation, report whether the original goal is completed, incomplete or unknown. Preserve typed FAILED/UNKNOWN as action history; a valid structured completed report bound to the current observation decides final goal completion. Only Worker-accepted structured local UI confirmations in the current execution inventory can resolve raw UNKNOWN; preserve historical receipts and do not claim business persistence. When a supplied complete dialog/main/form region alone establishes the goal, include its model_ref in evidence_refs; otherwise omit evidence_refs and the entire observation will be checked. A heading or toast alone is not a complete result. For a dispatched navigation with navigation_binding in the inventory, report completed only when the latest supplied destination evidence satisfies the original request, and include evidence_refs. The Worker accepts a valid completed report bound to the current observation even if the final URL differs from the approved link URL; raw local results remain diagnostic history. Further actions require new approvals.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        status: {
          type: "string",
          enum: ["completed", "incomplete", "unknown"],
        },
        summary: { type: "string", minLength: 1, maxLength: 4000 },
        ...(evidenceRefs.length
          ? {
              evidence_refs: {
                type: "array",
                maxItems: 8,
                uniqueItems: true,
                items: { type: "string", enum: evidenceRefs },
              },
            }
          : {}),
        observation_id: {
          type: "string",
          enum: [observationId],
          description: `Current feedback binding: copy exactly ${observationId}. Earlier plan evidence IDs, previous execution inventories and source/resource revisions do not identify this observation.`,
        },
      },
      required: ["status", "summary", "observation_id"],
    },
  },
});
