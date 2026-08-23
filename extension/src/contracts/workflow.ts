import type { MutationTool, Role, SemanticSnapshot } from "./types.js";
import { fail, isPlainObject, string } from "../security/validation.js";

export type WorkflowTarget = { role: Role; name: string };
export type WorkflowCondition =
  | { kind: "last_option_equals"; value: string }
  | {
      kind: "target_state";
      target: WorkflowTarget;
      field: "enabled" | "checked" | "selected" | "expanded";
      expected: boolean;
    };
export type WorkflowBranch = { when: WorkflowCondition; next: string };
export type WorkflowStep = {
  id: string;
  tool: Extract<
    MutationTool,
    "select_option_by_ref" | "set_checked_by_ref" | "click_by_ref"
  >;
  target: WorkflowTarget;
  next?: string;
  branches?: WorkflowBranch[];
};
export type WorkflowDeclaration = {
  schema_version: 1;
  id: string;
  title: string;
  steps: WorkflowStep[];
};

const roles = new Set<Role>([
  "button",
  "checkbox",
  "combobox",
  "radio",
  "tab",
  "menuitem",
  "textbox",
]);
const tools = new Set<WorkflowStep["tool"]>([
  "select_option_by_ref",
  "set_checked_by_ref",
  "click_by_ref",
]);
const stateFields = new Set<"enabled" | "checked" | "selected" | "expanded">([
  "enabled",
  "checked",
  "selected",
  "expanded",
]);
const target = (value: unknown): WorkflowTarget => {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some((key) => key !== "role" && key !== "name") ||
    typeof value.role !== "string" ||
    !roles.has(value.role as Role) ||
    typeof value.name !== "string"
  )
    return fail("INVALID_ARGUMENT");
  return { role: value.role as Role, name: string(value.name, 160) };
};
const condition = (value: unknown): WorkflowCondition => {
  if (!isPlainObject(value) || typeof value.kind !== "string")
    return fail("INVALID_ARGUMENT");
  if (value.kind === "last_option_equals") {
    if (
      Object.keys(value).some((key) => key !== "kind" && key !== "value") ||
      typeof value.value !== "string"
    )
      return fail("INVALID_ARGUMENT");
    return { kind: value.kind, value: string(value.value, 160) };
  }
  if (
    value.kind !== "target_state" ||
    Object.keys(value).some(
      (key) => !["kind", "target", "field", "expected"].includes(key),
    ) ||
    typeof value.field !== "string" ||
    !stateFields.has(
      value.field as "enabled" | "checked" | "selected" | "expanded",
    ) ||
    typeof value.expected !== "boolean"
  )
    return fail("INVALID_ARGUMENT");
  return {
    kind: value.kind,
    target: target(value.target),
    field: value.field as "enabled" | "checked" | "selected" | "expanded",
    expected: value.expected,
  };
};
const step = (value: unknown): WorkflowStep => {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some(
      (key) => !["id", "tool", "target", "next", "branches"].includes(key),
    ) ||
    typeof value.id !== "string" ||
    typeof value.tool !== "string" ||
    !tools.has(value.tool as WorkflowStep["tool"]) ||
    (value.next !== undefined && typeof value.next !== "string") ||
    (value.branches !== undefined && !Array.isArray(value.branches))
  )
    return fail("INVALID_ARGUMENT");
  const branches = value.branches?.map((branch) => {
    if (
      !isPlainObject(branch) ||
      Object.keys(branch).some((key) => key !== "when" && key !== "next") ||
      typeof branch.next !== "string"
    )
      return fail("INVALID_ARGUMENT");
    return { when: condition(branch.when), next: string(branch.next, 80) };
  });
  return {
    id: string(value.id, 80),
    tool: value.tool as WorkflowStep["tool"],
    target: target(value.target),
    ...(typeof value.next === "string" ? { next: string(value.next, 80) } : {}),
    ...(branches?.length ? { branches } : {}),
  };
};

export const validateWorkflowDeclaration = (
  value: unknown,
): WorkflowDeclaration => {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some(
      (key) => !["schema_version", "id", "title", "steps"].includes(key),
    ) ||
    value.schema_version !== 1 ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    !Array.isArray(value.steps) ||
    value.steps.length === 0 ||
    value.steps.length > 12
  )
    return fail("INVALID_ARGUMENT");
  const steps = value.steps.map(step);
  const ids = new Set(steps.map((item) => item.id));
  if (ids.size !== steps.length) return fail("INVALID_ARGUMENT");
  for (const item of steps)
    if (
      (item.next && !ids.has(item.next)) ||
      item.branches?.some((branch) => !ids.has(branch.next))
    )
      return fail("INVALID_ARGUMENT");
  return {
    schema_version: 1,
    id: string(value.id, 80),
    title: string(value.title, 160),
    steps,
  };
};

export const workflowTarget = (
  snapshot: SemanticSnapshot,
  expected: WorkflowTarget,
) => {
  const candidates = snapshot.nodes.filter(
    (node) =>
      node.role === expected.role &&
      node.name === expected.name &&
      node.visible &&
      node.enabled,
  );
  return candidates.length === 1 ? candidates[0] : undefined;
};
const workflowStateTarget = (
  snapshot: SemanticSnapshot,
  expected: WorkflowTarget,
) => {
  const candidates = snapshot.nodes.filter(
    (node) =>
      node.role === expected.role &&
      node.name === expected.name &&
      node.visible,
  );
  return candidates.length === 1 ? candidates[0] : undefined;
};

export const nextWorkflowStep = (
  workflow: WorkflowDeclaration,
  current: WorkflowStep,
  lastOption: string | undefined,
  snapshot: SemanticSnapshot,
): WorkflowStep | undefined => {
  const branch = current.branches?.find((item) => {
    if (item.when.kind === "last_option_equals")
      return item.when.value === lastOption;
    const node = workflowStateTarget(snapshot, item.when.target);
    const state =
      item.when.field === "enabled"
        ? node?.enabled
        : node?.state[item.when.field];
    return state === item.when.expected;
  });
  const next = branch?.next ?? current.next;
  if (!next) return undefined;
  return workflow.steps.find((item) => item.id === next);
};
