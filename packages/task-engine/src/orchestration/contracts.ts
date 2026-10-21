import type { DecisionContext } from "../decisions/schema.js";
export const phases = [
  "admission",
  "intent_classification",
  "codebase_discovery",
  "planning",
  "approval_pending",
  "waiting_input",
  "tool_execution",
  "result_verification",
  "analysis",
  "result_acceptance",
  "suspended",
  "completed",
  "failed",
  "cancelled",
] as const;
export type Phase = (typeof phases)[number];
export interface Orchestration {
  context: DecisionContext;
  phase: Phase;
  resumePhase: Phase | null;
  outcome: "PENDING" | "VERIFIED" | "INCOMPLETE" | "UNKNOWN" | "CANCELLED";
  firstFailure: string | null;
  activeStep: string | null;
  verifiedSteps: string[];
  ambiguousSteps: string[];
  turns: number;
  noProgress: number;
  progressDigest: string | null;
  deadline: number;
}
export interface Transition {
  expectedRevision: number;
  next: Phase;
  role: "runtime" | "jev" | "user" | "analyst";
  evidenceRefs: string[];
  progressDigest: string;
  reason?: string;
  step?: { id: string; status: "VERIFIED" | "UNKNOWN" | "INCOMPLETE" };
  acceptance?: {
    context: DecisionContext;
    requested: string[];
    verified: string[];
    analysisRequired: boolean;
    analysisAccepted: boolean;
  };
}
export interface JournalEntry {
  previousRevision: number;
  transition: Transition;
  state: Orchestration;
}
export interface OrchestrationStore {
  // Must atomically append the event and CAS the materialized state under a task lease.
  commit(entry: JournalEntry): Promise<void>;
}
export const isTerminal = (phase: Phase): boolean =>
  ["completed", "failed", "cancelled"].includes(phase);
