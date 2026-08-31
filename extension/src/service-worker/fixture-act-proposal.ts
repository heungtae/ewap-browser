import type { ModelActionProposal, SemanticNode } from "../contracts/types.js";
import { digestCanonical } from "../security/canonical.js";
import type { ActionDefinition } from "../state/mutation-coordinator.js";
import {
  localClickDefinition,
  localKeyDefinition,
  localMutationDefinition,
  localTextDefinition,
} from "./fixture-execution.js";
import type { StartActRequest } from "./start-act-message-handler.js";

export const fixtureTargetMatches = (
  request: StartActRequest,
  target: SemanticNode | undefined,
): target is SemanticNode =>
  !!target &&
  ((request.tool === "set_text_by_ref" && target.role === "textbox") ||
    (request.tool === "select_option_by_ref" && target.role === "combobox") ||
    (request.tool === "set_checked_by_ref" && target.role === "checkbox") ||
    (request.tool === "click_by_ref" && target.role === "button") ||
    (request.tool === "press_key_by_ref" &&
      ["button", "textbox", "combobox", "tab", "menuitem"].includes(
        target.role,
      )));

export const fixtureProposal = (
  request: StartActRequest,
  target: SemanticNode,
): {
  proposal: ModelActionProposal;
  definition: ActionDefinition;
  requiresConfirmation: boolean;
} => {
  const requiresConfirmation =
    request.tool === "set_checked_by_ref" &&
    target.name === "Require confirmation";
  const digest = digestCanonical(target.state);
  if (request.tool === "set_text_by_ref")
    return {
      proposal: { tool: request.tool, target: "development-fixture-target" },
      definition: localTextDefinition(digest),
      requiresConfirmation,
    };
  if (request.tool === "select_option_by_ref")
    return {
      proposal: { tool: request.tool, target: "development-fixture-target" },
      definition: localMutationDefinition(request.tool, target.ref_id, digest),
      requiresConfirmation,
    };
  if (request.tool === "click_by_ref")
    return {
      proposal: { tool: request.tool, target: "development-fixture-target" },
      definition: localClickDefinition(digest),
      requiresConfirmation,
    };
  if (request.tool === "press_key_by_ref")
    return {
      proposal: {
        tool: request.tool,
        target: "development-fixture-target",
        argument: { key: request.key! },
      },
      definition: localKeyDefinition(digest),
      requiresConfirmation,
    };
  return {
    proposal: {
      tool: request.tool,
      target: "development-fixture-target",
      argument: { checked: request.checked! },
    },
    definition: localMutationDefinition(
      request.tool,
      target.ref_id,
      digest,
      request.checked,
      requiresConfirmation,
    ),
    requiresConfirmation,
  };
};
