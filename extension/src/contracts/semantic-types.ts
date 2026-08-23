import type { Role } from "./core-types.js";

export type SemanticState = {
  disabled?: boolean;
  checked?: boolean;
  selected?: boolean;
  expanded?: boolean;
  required?: boolean;
};
export type PageReadScope = "all_dom" | "visible_only" | "interactive";
export type HiddenReason =
  | "display_none"
  | "visibility_hidden"
  | "opacity_zero"
  | "aria_hidden"
  | "outside_viewport"
  | "collapsed"
  | "zero_box"
  | "ancestor_hidden";
export type SemanticNode = {
  ref_id: string;
  role: Role;
  name: string;
  state: SemanticState;
  visible: boolean;
  visibility?: "visible" | "hidden";
  hidden_reason?: HiddenReason;
  enabled: boolean;
  parent_ref_id?: string;
  label_ref_id?: string;
};
export type SemanticSnapshot = {
  schema_version?: 2;
  document_epoch: string;
  frame_id: number;
  scope?: PageReadScope;
  truncated?: boolean;
  node_count?: number;
  nodes: SemanticNode[];
  visible_text: string;
  article_text?: string;
};
export type ModelSemanticNode = Omit<
  SemanticNode,
  "ref_id" | "parent_ref_id" | "label_ref_id"
> & { model_ref: string; parent_model_ref?: string; label_model_ref?: string };
export type ModelSemanticSnapshot = {
  schema_version?: 2;
  document_epoch: string;
  frame_id: number;
  scope?: PageReadScope;
  truncated?: boolean;
  node_count?: number;
  nodes: ModelSemanticNode[];
  visible_text: string;
  article_text?: string;
};
