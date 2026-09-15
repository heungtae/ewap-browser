import type { MutationTool, Role } from "./core-types.js";

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
type CompletionMarker = {
  role: Role;
  name: string;
  state?: { field: SemanticStatePredicate["field"]; expected: boolean };
};
export type CompletionContract =
  | {
      version: 2;
      kind: "control_state";
      source: "browser_derived" | "trusted_profile";
      scope_policy: "same_scope";
      report_scope: "control" | "ui";
      expected_changes: SemanticStatePredicate[];
    }
  | {
      version: 2;
      kind: "ui_relation";
      source: "trusted_profile";
      scope_policy: "same_scope";
      report_scope: "ui";
      marker: CompletionMarker;
    }
  | {
      version: 2;
      kind: "navigation";
      source: "browser_derived" | "trusted_profile";
      scope_policy: "navigation" | "declared_alternatives";
      report_scope: "navigation";
      destination_marker?: CompletionMarker;
    }
  | {
      version: 2;
      kind: "render_result";
      source: "trusted_profile";
      scope_policy: "same_scope" | "declared_alternatives";
      report_scope: "result";
      marker: CompletionMarker;
      requires_result_generation: true;
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
  /**
   * Retained only for the lifetime of an approved execution.  It lets the
   * verifier find a replacement node after a framework replaces the DOM;
   * it is never included in diagnostics or model output.
   */
  verification_target?: { role: Role; name: string };
  risk: "R1" | "R2";
  effect: "local-ui-only" | "server-side";
  verifier: VerifierPredicate;
  completion?: CompletionContract;
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
  | { target: string; tool: "click_by_ref" | "navigate" };
