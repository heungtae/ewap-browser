import { workflowTarget, type WorkflowStep } from "../contracts/workflow.js";
import type {
  ModelActionProposal,
  MutationTool,
  SemanticSnapshot,
} from "../contracts/types.js";
import { opaqueId } from "../security/canonical.js";
import { redactForChat } from "../security/chat-redaction.js";
import { fail, isPlainObject } from "../security/validation.js";
import type { ProfileActionTool } from "../profile/profile.js";
import {
  pageDerivedActionTools,
  pageDerivedOptionValues,
} from "./page-derived-actions.js";

export type ParsedActProposal = {
  id: string;
  tool: MutationTool;
  refId: string;
  targetName: string;
  approvalScope: "single_step" | "session";
  approvalReason: string;
  value?: string;
  argument?: { checked?: boolean; key?: "Enter" | "Space" | "Escape" };
  toolCallId: string;
  definition: ProfileActionTool;
};

export const parseActProposal = (
  call: { id: string; name: string; arguments: string },
  resolve: (proposal: ModelActionProposal) => string,
  snapshot: SemanticSnapshot,
  definitions: readonly ProfileActionTool[],
  discovery: "profile" | "page-derived",
  fixedTargetRefId?: string,
): ParsedActProposal => {
  let value: unknown;
  try {
    value = JSON.parse(call.arguments);
  } catch {
    return fail("INVALID_ARGUMENT");
  }
  if (!isPlainObject(value)) return fail("INVALID_ARGUMENT");
  const names: Partial<Record<MutationTool, string>> = {
    click_by_ref: "propose_click",
    set_text_by_ref: "propose_set_text",
    select_option_by_ref: "propose_select_option",
    set_checked_by_ref: "propose_set_checked",
    press_key_by_ref: "propose_press_key",
    navigate: "propose_navigate",
  };
  const definition = definitions.find((item) => call.name === names[item.tool]);
  if (!definition) return fail("INVALID_ARGUMENT");
  const keys =
    definition.tool === "click_by_ref" ||
    definition.tool === "navigate" ||
    definition.tool === "set_text_by_ref"
      ? ["target", "approval_scope", "approval_reason"]
      : definition.tool === "select_option_by_ref"
        ? ["target", "value", "approval_scope", "approval_reason"]
        : definition.tool === "set_checked_by_ref"
          ? ["target", "checked", "approval_scope", "approval_reason"]
          : ["target", "key", "approval_scope", "approval_reason"];
  const required = fixedTargetRefId
    ? keys.filter((key) => key !== "target")
    : keys;
  if (
    Object.keys(value).some((key) => !keys.includes(key)) ||
    required.some((key) => !(key in value)) ||
    (!fixedTargetRefId && typeof value.target !== "string") ||
    !["single_step", "session"].includes(value.approval_scope as string) ||
    typeof value.approval_reason !== "string" ||
    value.approval_reason.trim().length === 0 ||
    value.approval_reason.length > 240
  )
    return fail("INVALID_ARGUMENT");
  const argument =
    definition.tool === "set_checked_by_ref"
      ? typeof value.checked === "boolean"
        ? { checked: value.checked }
        : fail("INVALID_ARGUMENT")
      : definition.tool === "press_key_by_ref"
        ? typeof value.key === "string" &&
          ["Enter", "Space", "Escape"].includes(value.key)
          ? { key: value.key as "Enter" | "Space" | "Escape" }
          : fail("INVALID_ARGUMENT")
        : undefined;
  const optionValue =
    definition.tool === "select_option_by_ref"
      ? typeof value.value === "string" &&
        definition.option_values?.includes(value.value)
        ? value.value
        : fail("INVALID_ARGUMENT")
      : undefined;
  const refId =
    fixedTargetRefId ??
    resolve(
      (argument
        ? { target: value.target as string, tool: definition.tool, argument }
        : {
            target: value.target as string,
            tool: definition.tool,
          }) as ModelActionProposal,
    );
  const target = snapshot.nodes.find((node) => node.ref_id === refId);
  if (
    !target ||
    !target.enabled ||
    !definition.eligible_roles.includes(target.role)
  )
    return fail("TARGET_NOT_ACTIONABLE");
  if (
    definition.tool === "select_option_by_ref" &&
    discovery === "page-derived" &&
    (!optionValue ||
      !pageDerivedOptionValues(snapshot, refId).includes(optionValue))
  )
    return fail("TARGET_NOT_ACTIONABLE");
  if (
    definition.tool === "navigate" &&
    discovery === "page-derived" &&
    target.same_origin_link !== true &&
    target.cross_origin_link !== true
  )
    return fail("TARGET_NOT_ACTIONABLE");
  const approvalScope =
    value.approval_scope === "session" &&
    definition.risk === "R1" &&
    definition.effect === "local-ui-only" &&
    (definition.tool === "click_by_ref" || definition.tool === "navigate")
      ? "session"
      : "single_step";
  return {
    id: opaqueId(),
    tool: definition.tool,
    refId,
    targetName: target.name,
    approvalScope,
    approvalReason: redactForChat(value.approval_reason.trim(), 240),
    ...(optionValue ? { value: optionValue } : {}),
    ...(argument ? { argument } : {}),
    toolCallId: call.id,
    definition,
  };
};

export const workflowDefinitions = (
  snapshot: SemanticSnapshot,
  step: WorkflowStep,
): { definitions: ProfileActionTool[]; targetRefId: string } | undefined => {
  const target = workflowTarget(snapshot, step.target);
  if (!target) return undefined;
  const definition = pageDerivedActionTools(snapshot).find(
    (item) =>
      item.tool === step.tool && item.eligible_roles.includes(target.role),
  );
  if (!definition) return undefined;
  if (step.tool !== "select_option_by_ref")
    return { definitions: [definition], targetRefId: target.ref_id };
  const optionValues = pageDerivedOptionValues(snapshot, target.ref_id);
  return optionValues.length === 0
    ? undefined
    : {
        definitions: [{ ...definition, option_values: optionValues }],
        targetRefId: target.ref_id,
      };
};
