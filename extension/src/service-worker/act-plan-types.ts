import type { SubmitPlanInput } from "../page-act-harness/plan-contract.js";

export type StoredActPlan = {
  input: SubmitPlanInput;
  revision: number;
  documentEpoch: string;
  toolCallId: string;
  reviewId: string;
  approved: boolean;
  completedSteps: number;
  nextStep?: number;
};
