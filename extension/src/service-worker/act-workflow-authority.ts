import type { SemanticSnapshot } from "../contracts/types.js";
import { workflowTarget, type WorkflowStep } from "../contracts/workflow.js";
import type { ProfileActionTool } from "../profile/profile.js";
import { workflowDefinitions } from "./act-proposal-parser.js";

/** A page workflow cannot lower a signed Profile action's risk. */
export const workflowActionDefinitions = (
  snapshot: SemanticSnapshot,
  step: WorkflowStep,
  profileDefinitions: readonly ProfileActionTool[],
):
  | {
      definitions: ProfileActionTool[];
      targetRefId: string;
      discovery: "profile" | "page-derived";
    }
  | undefined => {
  if (profileDefinitions.length === 0) {
    const candidate = workflowDefinitions(snapshot, step);
    return candidate ? { ...candidate, discovery: "page-derived" } : undefined;
  }
  const target = workflowTarget(snapshot, step.target);
  if (!target || !target.visible || !target.enabled) return undefined;
  const definition = profileDefinitions.find(
    (item) =>
      item.tool === step.tool && item.eligible_roles.includes(target.role),
  );
  return definition
    ? {
        definitions: [definition],
        targetRefId: target.ref_id,
        discovery: "profile",
      }
    : undefined;
};
