import type {
  ModelSemanticSnapshot,
  SemanticSnapshot,
} from "../contracts/types.js";
import type { ProfileActionTool } from "../profile/profile.js";
import type { ProviderToolDefinition } from "../providers/types.js";

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

/**
 * Function tools remain generic by action type, while each target parameter is
 * constrained to the fresh opaque refs from this exact page projection.
 */
export const genericActTools = (
  definitions: readonly ProfileActionTool[],
  modelSnapshot: ModelSemanticSnapshot,
  snapshot: SemanticSnapshot,
  allowedRefIds?: ReadonlySet<string>,
): ProviderToolDefinition[] =>
  definitions.flatMap((definition) => {
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
              "Propose a visible enabled text field allowed by the current action policy. The user supplies the value after approval; never ask for a credential.",
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
        },
      ];
    if (definition.tool === "select_option_by_ref" && definition.option_values)
      return [
        {
          type: "function",
          function: {
            name: "propose_select_option",
            description:
              "Propose one visible enabled option selection allowed by the current action policy. This is not execution and requires user approval.",
            parameters: {
              type: "object",
              additionalProperties: false,
              properties: {
                target: targetParameter(targets),
                value: { type: "string", enum: definition.option_values },
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
              required: ["target", "key", "approval_scope", "approval_reason"],
            },
          },
        },
      ];
    return [];
  });
