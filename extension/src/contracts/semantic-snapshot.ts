import type {
  HiddenReason,
  PageReadScope,
  Role,
  SemanticNode,
  SemanticSnapshot,
  SemanticState,
} from "./types.js";
import { closedObject, fail, opaque, string } from "../security/validation.js";

const roles = new Set<Role>([
  "button",
  "checkbox",
  "combobox",
  "heading",
  "link",
  "option",
  "radio",
  "textbox",
  "listbox",
  "tab",
  "menuitem",
  "dialog",
  "alert",
  "status",
  "navigation",
  "main",
  "form",
]);
const stateKeys = ["disabled", "checked", "selected", "expanded", "required"];
const scopes = new Set<PageReadScope>([
  "all_dom",
  "visible_only",
  "interactive",
]);
const hiddenReasons = new Set<HiddenReason>([
  "display_none",
  "visibility_hidden",
  "opacity_zero",
  "aria_hidden",
  "outside_viewport",
  "collapsed",
  "zero_box",
  "ancestor_hidden",
]);
const parseState = (value: unknown): SemanticState => {
  const state = closedObject(value, stateKeys);
  for (const item of Object.values(state))
    if (typeof item !== "boolean") return fail("INVALID_ARGUMENT");
  return state as SemanticState;
};
const parseNode = (value: unknown): SemanticNode => {
  const node = closedObject(value, [
    "ref_id",
    "role",
    "name",
    "state",
    "visible",
    "visibility",
    "hidden_reason",
    "enabled",
    "parent_ref_id",
    "label_ref_id",
  ]);
  for (const required of [
    "ref_id",
    "role",
    "name",
    "state",
    "visible",
    "enabled",
  ])
    if (!(required in node)) return fail("INVALID_ARGUMENT");
  if (
    typeof node.role !== "string" ||
    !roles.has(node.role as Role) ||
    typeof node.visible !== "boolean" ||
    (node.visibility !== undefined &&
      node.visibility !== "visible" &&
      node.visibility !== "hidden") ||
    (node.hidden_reason !== undefined &&
      (typeof node.hidden_reason !== "string" ||
        !hiddenReasons.has(node.hidden_reason as HiddenReason))) ||
    (node.visibility === "visible" && node.hidden_reason !== undefined) ||
    typeof node.enabled !== "boolean"
  )
    return fail("INVALID_ARGUMENT");
  if (
    (node.visible &&
      (node.visibility === "hidden" || node.hidden_reason !== undefined)) ||
    (!node.visible &&
      (node.visibility !== "hidden" || node.hidden_reason === undefined))
  )
    return fail("INVALID_ARGUMENT");
  const parent =
    node.parent_ref_id === undefined ? undefined : opaque(node.parent_ref_id);
  const label =
    node.label_ref_id === undefined ? undefined : opaque(node.label_ref_id);
  return {
    ref_id: opaque(node.ref_id),
    role: node.role as Role,
    name: string(node.name, 160),
    state: parseState(node.state),
    visible: node.visible,
    ...(node.visibility ? { visibility: node.visibility } : {}),
    ...(node.hidden_reason
      ? { hidden_reason: node.hidden_reason as HiddenReason }
      : {}),
    enabled: node.enabled,
    ...(parent ? { parent_ref_id: parent } : {}),
    ...(label ? { label_ref_id: label } : {}),
  };
};
export const validateSemanticSnapshot = (value: unknown): SemanticSnapshot => {
  const snapshot = closedObject(value, [
    "document_epoch",
    "frame_id",
    "schema_version",
    "scope",
    "truncated",
    "node_count",
    "nodes",
    "visible_text",
  ]);
  if (
    !("document_epoch" in snapshot) ||
    !("frame_id" in snapshot) ||
    !("nodes" in snapshot) ||
    !("visible_text" in snapshot) ||
    typeof snapshot.frame_id !== "number" ||
    !Number.isInteger(snapshot.frame_id) ||
    snapshot.frame_id < 0 ||
    !Array.isArray(snapshot.nodes) ||
    snapshot.nodes.length > 5_000 ||
    typeof snapshot.visible_text !== "string" ||
    [...snapshot.visible_text].length > 12_000
  )
    return fail("INVALID_ARGUMENT");
  if (
    (snapshot.schema_version !== undefined && snapshot.schema_version !== 2) ||
    (snapshot.scope !== undefined &&
      (typeof snapshot.scope !== "string" ||
        !scopes.has(snapshot.scope as PageReadScope))) ||
    (snapshot.truncated !== undefined &&
      typeof snapshot.truncated !== "boolean") ||
    (snapshot.node_count !== undefined &&
      (typeof snapshot.node_count !== "number" ||
        !Number.isInteger(snapshot.node_count) ||
        snapshot.node_count < 0 ||
        snapshot.node_count < snapshot.nodes.length))
  )
    return fail("INVALID_ARGUMENT");
  const nodes = snapshot.nodes.map(parseNode);
  const ids = new Set(nodes.map((node) => node.ref_id));
  for (const node of nodes)
    if (
      (node.parent_ref_id &&
        (!ids.has(node.parent_ref_id) || node.parent_ref_id === node.ref_id)) ||
      (node.label_ref_id &&
        (!ids.has(node.label_ref_id) || node.label_ref_id === node.ref_id))
    )
      return fail("INVALID_ARGUMENT");
  return {
    ...(snapshot.schema_version === 2 ? { schema_version: 2 } : {}),
    document_epoch: opaque(snapshot.document_epoch),
    frame_id: snapshot.frame_id,
    ...(snapshot.scope ? { scope: snapshot.scope as PageReadScope } : {}),
    ...(typeof snapshot.truncated === "boolean"
      ? { truncated: snapshot.truncated }
      : {}),
    ...(typeof snapshot.node_count === "number"
      ? { node_count: snapshot.node_count }
      : {}),
    nodes,
    visible_text: snapshot.visible_text,
  };
};
