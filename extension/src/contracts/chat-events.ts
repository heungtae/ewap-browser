import type { Outcome } from "./types.js";
import { fail, isPlainObject, opaque, string } from "../security/validation.js";

export type ChatMode = "ask" | "act";
export type SafeToolResult = {
  outcome: Outcome;
  summary: string;
  code?: string;
};
export type ChatEventPayload =
  | { type: "run_started"; mode: ChatMode; permission_mode: string }
  | { type: "assistant_delta"; text: string }
  | { type: "tool_started"; tool_use_id: string; tool: string; summary: string }
  | {
      type: "tool_finished";
      tool_use_id: string;
      result: SafeToolResult;
    }
  | { type: "run_terminal"; outcome: Outcome; code?: string };

export type ChatEvent = ChatEventPayload & {
  run_id: string;
  sequence: number;
};

const outcomes = new Set<Outcome>([
  "VERIFIED",
  "FAILED",
  "UNKNOWN",
  "CANCELLED",
]);
const modes = new Set<ChatMode>(["ask", "act"]);
const allowedEventKeys = [
  "type",
  "run_id",
  "sequence",
  "mode",
  "permission_mode",
  "text",
  "tool_use_id",
  "tool",
  "summary",
  "result",
  "outcome",
  "code",
] as const;

export const validateChatEvent = (value: unknown): ChatEvent => {
  if (!isPlainObject(value)) return fail("INVALID_ARGUMENT");
  if (
    Object.keys(value).some((key) => !allowedEventKeys.includes(key as never))
  )
    return fail("INVALID_ARGUMENT");
  if (
    typeof value.type !== "string" ||
    typeof value.run_id !== "string" ||
    typeof value.sequence !== "number" ||
    !Number.isInteger(value.sequence) ||
    value.sequence < 1
  )
    return fail("INVALID_ARGUMENT");
  const sequence = value.sequence as number;
  const base = { run_id: opaque(value.run_id), sequence };
  if (value.type === "run_started") {
    if (
      typeof value.mode !== "string" ||
      !modes.has(value.mode as ChatMode) ||
      typeof value.permission_mode !== "string"
    )
      return fail("INVALID_ARGUMENT");
    return {
      ...base,
      type: "run_started",
      mode: value.mode as ChatMode,
      permission_mode: string(value.permission_mode, 64),
    };
  }
  if (value.type === "assistant_delta") {
    if (typeof value.text !== "string") return fail("INVALID_ARGUMENT");
    return {
      ...base,
      type: "assistant_delta",
      text: string(value.text, 16_000),
    };
  }
  if (value.type === "tool_started") {
    if (
      typeof value.tool_use_id !== "string" ||
      typeof value.tool !== "string" ||
      typeof value.summary !== "string"
    )
      return fail("INVALID_ARGUMENT");
    return {
      ...base,
      type: "tool_started",
      tool_use_id: opaque(value.tool_use_id),
      tool: string(value.tool, 128),
      summary: string(value.summary, 512),
    };
  }
  if (value.type === "tool_finished") {
    if (
      !isPlainObject(value.result) ||
      Object.keys(value.result).some(
        (key) => !["outcome", "summary", "code"].includes(key),
      )
    )
      return fail("INVALID_ARGUMENT");
    if (
      typeof value.tool_use_id !== "string" ||
      typeof value.result.outcome !== "string" ||
      !outcomes.has(value.result.outcome as Outcome) ||
      typeof value.result.summary !== "string" ||
      (value.result.code !== undefined && typeof value.result.code !== "string")
    )
      return fail("INVALID_ARGUMENT");
    return {
      ...base,
      type: "tool_finished",
      tool_use_id: opaque(value.tool_use_id),
      result: {
        outcome: value.result.outcome as Outcome,
        summary: string(value.result.summary, 512),
        ...(typeof value.result.code === "string"
          ? { code: string(value.result.code, 128) }
          : {}),
      },
    };
  }
  if (value.type === "run_terminal") {
    if (
      typeof value.outcome !== "string" ||
      !outcomes.has(value.outcome as Outcome)
    )
      return fail("INVALID_ARGUMENT");
    if (value.code !== undefined && typeof value.code !== "string")
      return fail("INVALID_ARGUMENT");
    return {
      ...base,
      type: "run_terminal",
      outcome: value.outcome as Outcome,
      ...(typeof value.code === "string"
        ? { code: string(value.code, 128) }
        : {}),
    };
  }
  return fail("INVALID_ARGUMENT");
};
