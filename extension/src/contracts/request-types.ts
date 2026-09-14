import type { ErrorCode, Outcome } from "./core-types.js";
import type { ActivityStage } from "./chat-event-types.js";
export type RequestStage =
  | "ACCEPTED"
  | ActivityStage
  | "TERMINAL"
  | "PROVIDER_BODY"
  | "DISPATCH"
  | "VERIFY";
export type RequestState = "ACCEPTED" | "RUNNING" | "WAITING_USER" | "TERMINAL";

export type RequestSnapshot = {
  request_id: string;
  revision: number;
  state: RequestState;
  stage: RequestStage;
  tab_id: number;
  started_at_ms: number;
  stage_started_at_ms: number;
  last_progress_at_ms: number;
  outcome?: Outcome;
  code?: ErrorCode;
  dispatch_started?: boolean;
};
