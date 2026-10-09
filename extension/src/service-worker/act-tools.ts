import type {
  ModelSemanticSnapshot,
  SemanticSnapshot,
} from "../contracts/types.js";
import type { ProfileActionTool } from "../profile/profile.js";
import type { ProviderToolDefinition } from "../providers/types.js";
import { isCustomListboxOption } from "./page-derived-actions.js";
import type { PageApiActionRef } from "../contracts/page-api-types.js";

const targetParameter = (targets: readonly string[]) => ({
  type: "string",
  enum: targets,
  description:
    "One supplied opaque model_ref. Never use a visible name, selector, or URL.",
});
const approvalScopeParameter = {
  type: "string",
  enum: ["single_step", "session"],
  description:
    "single_step requires another approval for a later action. session is only for a low-risk bounded sequence of distinct clicks or navigations after one approval.",
};
const approvalReasonParameter = {
  type: "string",
  minLength: 1,
  maxLength: 240,
  description:
    "A short Korean reason for the approval_scope. Explain why single_step needs another approval; use a short bounded-scope reason for session.",
};

const eligibleTargets = (
  definition: ProfileActionTool,
  modelSnapshot: ModelSemanticSnapshot,
  snapshot: SemanticSnapshot,
  allowedRefIds?: ReadonlySet<string>,
): string[] =>
  modelSnapshot.nodes.flatMap((node, index) => {
    const source = snapshot.nodes[index];
    if (
      !source ||
      (allowedRefIds && !allowedRefIds.has(source.ref_id)) ||
      !node.visible ||
      !node.enabled ||
      !definition.eligible_roles.includes(node.role)
    )
      return [];
    if (
      definition.tool === "click_by_ref" &&
      source.role === "menuitem" &&
      (source.same_origin_link === true || source.cross_origin_link === true)
    )
      return [];
    if (
      definition.tool === "click_by_ref" &&
      node.role === "option" &&
      !isCustomListboxOption(snapshot, source)
    )
      return [];
    if (
      definition.tool === "navigate" &&
      source.same_origin_link !== true &&
      source.cross_origin_link !== true
    )
      return [];
    return [node.model_ref];
  });

const genericActClickTool = (
  targets: readonly string[],
): ProviderToolDefinition => ({
  type: "function",
  function: {
    name: "propose_click",
    description:
      "Propose one visible enabled button, tab, or menu-item click allowed by the current action policy. Choose approval_scope=session only for a menu expansion needed solely for simple navigation; choose single_step for Run, Save, Submit, Apply, Delete, purchase, or another page-state-changing click. This is not execution and requires user approval.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        target: targetParameter(targets),
        approval_scope: approvalScopeParameter,
        approval_reason: approvalReasonParameter,
      },
      required: ["target", "approval_scope", "approval_reason"],
    },
  },
});

const genericActNavigateTool = (
  targets: readonly string[],
): ProviderToolDefinition => ({
  type: "function",
  function: {
    name: "propose_navigate",
    description:
      "Propose navigation through one visible enabled observed HTTP(S) link allowed by the current action policy. For simple navigation choose approval_scope=session so the user can approve the bounded path once. This is not execution and requires user approval.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        target: targetParameter(targets),
        approval_scope: approvalScopeParameter,
        approval_reason: approvalReasonParameter,
      },
      required: ["target", "approval_scope", "approval_reason"],
    },
  },
});

export const requestClarificationTool = (
  targets: readonly string[],
): ProviderToolDefinition => ({
  type: "function",
  function: {
    name: "request_clarification",
    description:
      "Ask the user for a missing or ambiguous input value. Use only when the original request plus related user responses and the latest UI do not carry a clear value or target/value mapping. The question is shown in a value card; the answer returns into the same conversation and a new input proposal follows. Never guess a value and never use keyword or regex extraction.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        question: {
          type: "string",
          minLength: 1,
          maxLength: 2000,
          description: "The exact question for the missing value.",
        },
        value_kind: {
          type: "string",
          enum: ["text", "option"],
        },
        ...(targets.length > 0
          ? { target: { type: "string", enum: [...targets] } }
          : {}),
      },
      required: ["question", "value_kind"],
    },
  },
});

/**
 * Function tools remain generic by action type, while each target parameter is
 * constrained to the fresh opaque refs from this exact page projection.
 */
export const genericActTools = (
  definitions: readonly ProfileActionTool[],
  modelSnapshot: ModelSemanticSnapshot,
  snapshot: SemanticSnapshot,
  allowedRefIds?: ReadonlySet<string>,
  pageApiActions: readonly PageApiActionRef[] = [],
): ProviderToolDefinition[] => {
  const base = [
    ...definitions.flatMap((definition): ProviderToolDefinition[] => {
      const targets = eligibleTargets(
        definition,
        modelSnapshot,
        snapshot,
        allowedRefIds,
      );
      if (targets.length === 0) return [];
      if (definition.tool === "click_by_ref")
        return [genericActClickTool(targets)];
      if (definition.tool === "navigate")
        return [genericActNavigateTool(targets)];
      if (definition.tool === "set_text_by_ref")
        return [
          {
            type: "function",
            function: {
              name: "propose_set_text",
              description:
                "Propose one visible enabled text field with the LLM-judged value. Judge from the original request plus related user responses and the latest UI which target gets which value and whether a question is needed. When the request already carries a clear value for this target, include that exact value with its source request revision; the approved value is then typed without an extra value card. When no value is present or the target/value mapping is ambiguous, do not guess: call request_clarification instead. Never use keyword, regex, or fixture-name extraction and never ask for a credential.",
              parameters: {
                type: "object",
                additionalProperties: false,
                properties: {
                  target: targetParameter(targets),
                  value: {
                    type: "string",
                    minLength: 1,
                    maxLength: 4096,
                    description:
                      "The exact user-supplied value to type. Omit only for the legacy target-only path; new proposals must include it with value_source_revision.",
                  },
                  value_source_revision: {
                    type: "integer",
                    minimum: 1,
                    description:
                      "Request revision that supplied the value (original request or clarification answer). Must accompany value.",
                  },
                  approval_scope: approvalScopeParameter,
                  approval_reason: approvalReasonParameter,
                },
                required: ["target", "approval_scope", "approval_reason"],
              },
            },
          },
        ];
      if (
        definition.tool === "select_option_by_ref" &&
        definition.option_values
      )
        return [
          {
            type: "function",
            function: {
              name: "propose_select_option",
              description:
                "Propose one visible enabled option selection with the LLM-judged enum value. Judge the target/value mapping from the original request plus related user responses and the latest UI; ambiguous cases must call request_clarification instead of guessing. New proposals must include value_source_revision with the value so the binding proves freshness.",
              parameters: {
                type: "object",
                additionalProperties: false,
                properties: {
                  target: targetParameter(targets),
                  value: { type: "string", enum: definition.option_values },
                  value_source_revision: {
                    type: "integer",
                    minimum: 1,
                    description:
                      "Request revision that supplied the value (original request or clarification answer).",
                  },
                  approval_scope: approvalScopeParameter,
                  approval_reason: approvalReasonParameter,
                },
                required: [
                  "target",
                  "value",
                  "approval_scope",
                  "approval_reason",
                ],
              },
            },
          },
        ];
      if (definition.tool === "set_checked_by_ref")
        return [
          {
            type: "function",
            function: {
              name: "propose_set_checked",
              description:
                "Propose a visible enabled checkbox state allowed by the current action policy. This is not execution and requires user approval.",
              parameters: {
                type: "object",
                additionalProperties: false,
                properties: {
                  target: targetParameter(targets),
                  checked: { type: "boolean" },
                  approval_scope: approvalScopeParameter,
                  approval_reason: approvalReasonParameter,
                },
                required: [
                  "target",
                  "checked",
                  "approval_scope",
                  "approval_reason",
                ],
              },
            },
          },
        ];
      if (definition.tool === "press_key_by_ref")
        return [
          {
            type: "function",
            function: {
              name: "propose_press_key",
              description:
                "Propose one visible enabled key press allowed by the current action policy. This is not execution and requires user approval.",
              parameters: {
                type: "object",
                additionalProperties: false,
                properties: {
                  target: targetParameter(targets),
                  key: { type: "string", enum: ["Enter", "Space", "Escape"] },
                  approval_scope: approvalScopeParameter,
                  approval_reason: approvalReasonParameter,
                },
                required: [
                  "target",
                  "key",
                  "approval_scope",
                  "approval_reason",
                ],
              },
            },
          },
        ];
      return [];
    }),
    ...(pageApiActions.length === 0
      ? []
      : [
          {
            type: "function" as const,
            function: {
              name: "propose_page_api",
              description:
                "Propose one reviewed local page API action. This is not execution and always requires one user approval.",
              parameters: {
                type: "object",
                additionalProperties: false,
                properties: {
                  action_ref: {
                    type: "string",
                    enum: pageApiActions.map((action) => action.action_ref),
                  },
                  option_id: {
                    type: "string",
                    enum: [
                      ...new Set(
                        pageApiActions.flatMap((action) => action.option_ids),
                      ),
                    ],
                  },
                  approval_scope: { type: "string", enum: ["single_step"] },
                  approval_reason: approvalReasonParameter,
                },
                required: [
                  "action_ref",
                  "option_id",
                  "approval_scope",
                  "approval_reason",
                ],
              },
            },
          },
        ]),
  ] as ProviderToolDefinition[];
  // PAH-9: value clarification is offered alongside text/option inputs so the
  // model can ask instead of guessing. It carries no approval fields and
  // never executes; the answer returns into the same conversation.
  const clarificationTargets = definitions.flatMap((definition) =>
    definition.tool === "set_text_by_ref" ||
    definition.tool === "select_option_by_ref"
      ? eligibleTargets(definition, modelSnapshot, snapshot, allowedRefIds)
      : [],
  );
  const hasInputTool = definitions.some(
    (definition) =>
      definition.tool === "set_text_by_ref" ||
      definition.tool === "select_option_by_ref",
  );
  if (!hasInputTool) return base;
  return [
    ...base,
    requestClarificationTool([...new Set(clarificationTargets)]),
  ];
};
