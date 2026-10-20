import type { Effect, SemanticRef, ToolContext } from "./identity.js";
import type { ToolId } from "./inputs.js";
import type { PreparedStep, Receipt } from "./contracts.js";
export type Argument =
  | string
  | boolean
  | number
  | Record<string, string | boolean | number>;
export interface ResolvedArgument {
  value: Argument;
  sourceDigest: string;
}
export interface ArgumentPort {
  resolve(
    tool: ToolId,
    intent: unknown,
    context: ToolContext,
  ): Promise<ResolvedArgument>;
}
export interface Observation {
  passed: boolean;
  digest: string;
}
export interface TargetSnapshot {
  bindingId: string;
  target: SemanticRef;
  observationDigest: string;
  predicate: SemanticRef;
  effect: Effect;
  verifierId: string;
  adapterId: string;
}
export interface BrowserPort {
  resolve(
    tool: ToolId,
    intent: unknown,
    context: ToolContext,
    argument: Argument,
  ): Promise<TargetSnapshot>;
  preflight(step: PreparedStep, argument: Argument): Promise<void>;
  observe(step: PreparedStep, argument: Argument): Promise<Observation>;
  dispatch(
    step: PreparedStep,
    argument: Argument,
    beforeSideEffect: () => void,
  ): Promise<{ commands: number }>;
}
export interface DispatchJournal {
  reserve(
    id: string,
    step: PreparedStep,
  ): Promise<{ fresh: boolean; receipt: Receipt | null }>;
  settle(id: string, receipt: Receipt): Promise<void>;
}
export interface IntentJournal {
  record(step: PreparedStep): Promise<void>;
}
export interface ToolResult {
  toolCallId: string;
  tool: ToolId;
  status: "completed" | "unavailable" | "pending";
  data: unknown;
}
export interface ToolHandler {
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
  verify(
    input: unknown,
    context: ToolContext,
    result: ToolResult,
  ): Promise<boolean>;
}
