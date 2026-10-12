import type { ActionResult } from "../page-act-harness/outcome.js";
export type ActExecutionEvidence = ActionResult & {
  page_method_invocation?: import("../contracts/page-method-types.js").PageMethodResult["invocation"];
  navigation_binding?: import("./act-navigation-confirmation.js").NavigationBinding;
  target_binding?: string;
  semantic_binding?: string;
  input_binding?: string;
  dispatch?: import("../contracts/act-assessment.js").DispatchReceipt;
  logical_step_id?: string;
  confirmation?: "local_verifier" | "llm_evidence" | "current_state";
  raw_outcome?: "VERIFIED" | "FAILED" | "UNKNOWN";
  assessment_id?: string;
  outcome: "VERIFIED" | "FAILED" | "UNKNOWN";
  code?: string;
  navigation: boolean;
  alreadySatisfied: boolean;
};
