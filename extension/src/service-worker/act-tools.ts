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
      "Propose one visible enabled button, tab, or menu-item click allowed by the current action policy. This is not execution and requires user approval.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { target: targetParameter(targets) },
      required: ["target"],
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
      "Propose navigation through one visible enabled observed HTTP(S) link allowed by the current action policy. This is not execution and requires user approval.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: { target: targetParameter(targets) },
      required: ["target"],
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
              properties: { target: targetParameter(targets) },
              required: ["target"],
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
              },
              required: ["target", "value"],
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
              },
              required: ["target", "checked"],
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
              },
              required: ["target", "key"],
            },
          },
        },
      ];
    return [];
  });
