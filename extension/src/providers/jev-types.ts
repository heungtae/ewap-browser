export const decisionPhases = [
  "intent",
  "workflow_suitability",
  "candidate_selection",
  "element_assessment",
  "action_assessment",
  "goal_assessment",
  "result_acceptance",
] as const;
export type DecisionPhase = (typeof decisionPhases)[number];
export type DecisionQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "noul"; instructions: string }
  | { type: "score"; instructions: string; criteria: string[] };
export type DecisionTask = {
  phase: DecisionPhase;
  state: Record<string, unknown>;
  questions: Record<string, DecisionQuestion>;
};
export type DecisionAnswer =
  | {
      type: "choice";
      choice: string;
      confidence: number;
      probabilities: Record<string, number>;
    }
  | { type: "noul"; noul: number }
  | {
      type: "score";
      score: number;
      confidence: number;
      probabilities: Record<string, number>;
      legend: Record<string, string>;
    };
export type DecisionResponse = {
  model: string;
  answers: Record<string, DecisionAnswer>;
  usage: { input_tokens: number; output_tokens: number };
};
export type JevJudgment = {
  source: "jev";
  phase: DecisionPhase;
  decision_id: string;
  answers: DecisionResponse["answers"];
};
export type ProviderActivity = {
  provider_role: "primary" | "decision";
  stage:
    | "DECIDING"
    | "DELEGATING"
    | "PROCESSING"
    | "REVIEWING"
    | "FALLBACK"
    | "STOPPED";
  phase: DecisionPhase | "primary_processing";
  code?: string;
};
export type ModelRequestOptions = {
  phase?: DecisionPhase;
  signal?: AbortSignal;
  bindingSignal?: AbortSignal;
  onDelta?: (text: string) => void;
  onProgress?: () => void;
  onRole?: (event: ProviderActivity) => void;
};
