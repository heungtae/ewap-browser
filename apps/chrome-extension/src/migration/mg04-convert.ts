import { validateChatEvent } from "../../../../extension/src/contracts/chat-events.js";
import {
  isPlainObject,
  opaque,
} from "../../../../extension/src/security/validation.js";
import {
  canonicalJson,
  digestCanonical,
} from "../../../../extension/src/security/canonical.js";
import { historyEvent } from "./mg04-events.js";
function validId(value: string) {
  try {
    opaque(value);
    return true;
  } catch {
    return false;
  }
}
export type HistorySnapshot = { chat_session_v1?: unknown };
export function convertMg04(snapshot: HistorySnapshot) {
  const records: ReturnType<typeof threadHistory>[] = [];
  const quarantine: {
    sourceIndex: number;
    reason: "INVALID_CONTAINER" | "INVALID_THREAD" | "DUPLICATE_THREAD";
  }[] = [];
  const value = snapshot.chat_session_v1;
  // The actual legacy clear operation writes null.
  if (value === undefined || value === null)
    return {
      schema: "wca.mg04-history/v1" as const,
      records,
      quarantine,
      sourceCount: 0,
    };
  if (
    !isPlainObject(value) ||
    value.schema_version !== 1 ||
    typeof value.session_id !== "string" ||
    !validId(value.session_id) ||
    !Array.isArray(value.threads) ||
    value.threads.length > 8 ||
    Object.keys(value).some(
      (key) => !["schema_version", "session_id", "threads"].includes(key),
    ) ||
    new TextEncoder().encode(canonicalJson(value)).length > 1024 * 1024
  ) {
    quarantine.push({ sourceIndex: -1, reason: "INVALID_CONTAINER" });
    return {
      schema: "wca.mg04-history/v1" as const,
      records,
      quarantine,
      sourceCount: 1,
    };
  }
  const seenTabs = new Set<number>(),
    seenThreads = new Set<string>();
  for (const [sourceIndex, thread] of value.threads.entries()) {
    try {
      const record = threadHistory(thread, value.session_id);
      if (
        seenTabs.has(record.historicalTabId) ||
        seenThreads.has(record.legacyThreadId)
      ) {
        quarantine.push({ sourceIndex, reason: "DUPLICATE_THREAD" });
        continue;
      }
      seenTabs.add(record.historicalTabId);
      seenThreads.add(record.legacyThreadId);
      records.push(record);
    } catch {
      quarantine.push({ sourceIndex, reason: "INVALID_THREAD" });
    }
  }
  return {
    schema: "wca.mg04-history/v1" as const,
    records,
    quarantine,
    sourceCount: value.threads.length,
  };
}
function threadHistory(raw: unknown, sessionId: string) {
  opaque(sessionId);
  if (
    !isPlainObject(raw) ||
    typeof raw.thread_id !== "string" ||
    !Number.isSafeInteger(raw.tab_id) ||
    (raw.tab_id as number) < 0 ||
    !Array.isArray(raw.events) ||
    Object.keys(raw).some(
      (key) => !["thread_id", "tab_id", "scope", "events"].includes(key),
    ) ||
    !isPlainObject(raw.scope) ||
    Object.keys(raw.scope).some(
      (key) =>
        !["document_epoch", "page_scope_epoch", "origin", "path"].includes(key),
    ) ||
    !["document_epoch", "page_scope_epoch", "origin", "path"].every(
      (key) => typeof (raw.scope as Record<string, unknown>)[key] === "string",
    ) ||
    new TextEncoder().encode(canonicalJson(raw.events)).length > 128 * 1024
  )
    throw new Error("INVALID_HISTORY_THREAD");
  opaque(raw.thread_id);
  const events = raw.events.map(validateChatEvent);
  let last = 0;
  for (const event of events) {
    if (
      event.session_id !== sessionId ||
      event.thread_id !== raw.thread_id ||
      event.tab_id !== raw.tab_id ||
      event.sequence <= last
    )
      throw new Error("HISTORY_BINDING");
    last = event.sequence;
  }
  return {
    legacySessionId: sessionId,
    legacyThreadId: raw.thread_id,
    historicalTabId: raw.tab_id as number,
    historicalScope: structuredClone(raw.scope),
    sourceDigest: digestCanonical(raw),
    historyOnly: true as const,
    executable: false as const,
    reconnectAllowed: false as const,
    timeline: events.map(historyEvent),
  };
}
export type HistoryConversion = ReturnType<typeof convertMg04>;
