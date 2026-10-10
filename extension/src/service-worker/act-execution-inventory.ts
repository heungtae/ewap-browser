import type { ProviderToolDefinition } from "../providers/types.js";
import type { ActSession } from "./act-session-types.js";

export const actExecutionInventory = (opts: {
  session: ActSession;
  observationId: string;
  requestRevision: number;
  documentEpoch: string;
  actionTools: ProviderToolDefinition[];
  readTools: ProviderToolDefinition[];
}) => {
  const permissions: Record<string, string> = {
    propose_click: "click",
    propose_navigate: "navigate",
    propose_set_text: "type",
    propose_select_option: "type",
    propose_set_checked: "click",
    propose_press_key: "click",
    propose_page_api: "page_api",
  };
  return {
    observation_id: opts.observationId,
    request_revision: opts.requestRevision,
    document_epoch: opts.documentEpoch,
    coverage: "visible_only",
    actions: opts.actionTools
      .filter((tool) => tool.function.name !== "request_clarification")
      .map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
        result_schema: {
          type: "object",
          properties: {
            outcome: {
              type: "string",
              enum: ["VERIFIED", "FAILED", "UNKNOWN"],
            },
            observed: { type: "boolean" },
            dispatched: { type: "boolean" },
            alreadySatisfied: { type: "boolean" },
            verifier: {
              type: "string",
              enum: ["satisfied", "failed", "pending"],
            },
            code: { type: "string" },
          },
          required: ["outcome"],
        },
        verification_meaning: "TYPED_ACTION_RESULT_NOT_GOAL_COMPLETION",
        permission: permissions[tool.function.name],
        side_effect:
          tool.function.name === "propose_navigate"
            ? "navigation"
            : "local_ui_mutation",
        approval_required: true,
        supported: true,
      })),
    page_api_actions: (opts.session.pageApiActions ?? []).map((action) => ({
      action_ref: action.action_ref,
      label: action.label,
      description: action.description,
      option_ids: action.option_ids,
      option_labels: action.option_labels,
      completion: action.completion,
      permission: "page_api",
      side_effect: "local-ui-only",
      arguments_supported: "registered option_id only",
      arbitrary_arguments: "UNSUPPORTED",
      result_supported:
        "typed DOM postcondition only; arbitrary return values UNSUPPORTED",
    })),
    arbitrary_functions: "UNSUPPORTED",
    arbitrary_api_arguments: "UNSUPPORTED",
    reviewed_readers: opts.readTools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: tool.function.parameters,
      result_schema: {
        coverage: "bounded; read result owns completeness",
        status: "typed read result",
      },
      permission:
        tool.function.name === "read_page_resource" ||
        tool.function.name === "search_page_resources"
          ? "source_disclosure_consent"
          : tool.function.name === "read_component_data"
            ? "channel-dependent collection approval or vision consent"
            : ["screenshot", "zoom"].includes(tool.function.name)
              ? "vision policy and consent"
              : "page_read",
      side_effect:
        tool.function.name === "read_component_data"
          ? "channel-dependent bounded scroll; separate approved UI paging/expansion"
          : "none",
      binding: "request-document",
    })),
    plan: opts.session.plan
      ? {
          plan_id: opts.session.plan.input.plan_id,
          plan_revision: opts.session.plan.revision,
          approved: opts.session.plan.approved,
          approval_scope: opts.session.plan.input.approval_scope,
          completed_steps: opts.session.plan.completedSteps,
          steps: opts.session.plan.input.steps,
        }
      : null,
    execution_evidence: opts.session.executionEvidence ?? [],
  };
};
