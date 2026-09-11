import { fail, isPlainObject, opaque, string } from "../security/validation.js";
import type { Outcome } from "./core-types.js";
import type { ActivityStage, ChatEvent, ChatMode } from "./chat-event-types.js";
import {
  allowedEventKeys,
  activityStages,
  modes,
  outcomes,
  validateActionView,
} from "./chat-event-validation.js";
export type {
  ChatActionView,
  ChatEvent,
  ChatEventPayload,
  ChatMode,
  SafeToolResult,
} from "./chat-event-types.js";

export const validateChatEvent = (value: unknown): ChatEvent => {
  if (!isPlainObject(value)) return fail("INVALID_ARGUMENT");
  if (
    Object.keys(value).some((key) => !allowedEventKeys.includes(key as never))
  )
    return fail("INVALID_ARGUMENT");
  if (
    typeof value.type !== "string" ||
    typeof value.session_id !== "string" ||
    typeof value.thread_id !== "string" ||
    typeof value.tab_id !== "number" ||
    !Number.isInteger(value.tab_id) ||
    value.tab_id < 0 ||
    typeof value.run_id !== "string" ||
    typeof value.sequence !== "number" ||
    !Number.isInteger(value.sequence) ||
    value.sequence < 1
  )
    return fail("INVALID_ARGUMENT");
  const sequence = value.sequence as number;
  const base = {
    session_id: opaque(value.session_id),
    thread_id: opaque(value.thread_id),
    tab_id: value.tab_id,
    run_id: opaque(value.run_id),
    sequence,
  };
  if (value.type === "user_message") {
    if (typeof value.text !== "string") return fail("INVALID_ARGUMENT");
    return { ...base, type: "user_message", text: string(value.text, 16_000) };
  }
  if (value.type === "page_scope_changed")
    return { ...base, type: "page_scope_changed" };
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
  if (
    value.type === "activity_started" ||
    value.type === "activity_progress" ||
    value.type === "activity_finished"
  ) {
    if (
      typeof value.stage !== "string" ||
      !activityStages.has(value.stage as ActivityStage)
    )
      return fail("INVALID_ARGUMENT");
    return {
      ...base,
      type: value.type,
      stage: value.stage as ActivityStage,
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
  if (value.type === "tool_progress") {
    if (
      typeof value.tool_use_id !== "string" ||
      typeof value.summary !== "string"
    )
      return fail("INVALID_ARGUMENT");
    return {
      ...base,
      type: "tool_progress",
      tool_use_id: opaque(value.tool_use_id),
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
  if (value.type === "action_review_required")
    return {
      ...base,
      type: "action_review_required",
      action: validateActionView(value.action),
    };
  if (value.type === "permission_required") {
    if (
      typeof value.request_id !== "string" ||
      typeof value.capability !== "string" ||
      typeof value.host !== "string"
    )
      return fail("INVALID_ARGUMENT");
    return {
      ...base,
      type: "permission_required",
      request_id: opaque(value.request_id),
      action: validateActionView(value.action),
      capability: string(value.capability, 64),
      host: string(value.host, 255),
    };
  }
  if (value.type === "value_required") {
    if (value.value_kind !== "text" && value.value_kind !== "option")
      return fail("INVALID_ARGUMENT");
    return {
      ...base,
      type: "value_required",
      action: validateActionView(value.action),
      value_kind: value.value_kind,
    };
  }
  if (value.type === "confirmation_required") {
    if (
      typeof value.confirmation_id !== "string" ||
      typeof value.confirmation_nonce !== "string"
    )
      return fail("INVALID_ARGUMENT");
    return {
      ...base,
      type: "confirmation_required",
      action: validateActionView(value.action),
      confirmation_id: opaque(value.confirmation_id),
      confirmation_nonce: opaque(value.confirmation_nonce),
    };
  }
  return fail("INVALID_ARGUMENT");
};
