import type { MutationTool } from "./core-types.js";

export type ValueKind = "text" | "option";
export type ValueBinding = {
  value_slot_id: string;
  value_kind: ValueKind;
  value_digest: string;
};
export type SemanticStatePredicate = {
  ref_id: string;
  field: "checked" | "selected" | "disabled" | "expanded";
  expected: boolean;
};
export type VerifierPredicate =
  | {
      kind: "semantic-state-transition";
      declaration_id: string;
      pre_state_digest: string;
      required_changes: SemanticStatePredicate[];
    }
  | {
      kind: "exact-navigation-transition";
      declaration_id: string;
      pre_page_context_digest: string;
      origin: string;
      path_template_id: string;
      required_post_states: SemanticStatePredicate[];
    }
  | {
      kind: "business-state-transition";
      declaration_id: string;
      precondition_token: string;
      authoritative_field_id: string;
      expected_transition: string;
    };
export type ActionIntent = {
  tool: MutationTool;
  run_id: string;
  tab_id: number;
  frame_id: number;
  document_epoch: string;
  profile: { id: string; version: number };
  ref_id: string;
  risk: "R1" | "R2";
  effect: "local-ui-only" | "server-side";
  verifier: VerifierPredicate;
  argument?: { checked?: boolean; key?: "Enter" | "Space" | "Escape" };
  value_binding?: ValueBinding;
};
export type ModelActionProposal =
  | { target: string; tool: "set_text_by_ref" | "select_option_by_ref" }
  | {
      target: string;
      tool: "set_checked_by_ref";
      argument: { checked: boolean };
    }
  | {
      target: string;
      tool: "press_key_by_ref";
      argument: { key: "Enter" | "Space" | "Escape" };
    }
  | { target: string; tool: "click_by_ref" };
