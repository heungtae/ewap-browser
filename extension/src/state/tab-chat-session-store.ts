import type { ChatEvent, ChatEventPayload } from "../contracts/chat-events.js";
import { validateChatEvent } from "../contracts/chat-events.js";
import { opaqueId } from "../security/canonical.js";
import { redactForChat } from "../security/chat-redaction.js";
import { fail } from "../security/validation.js";

export type PageScope = {
  document_epoch: string;
  page_scope_epoch: string;
  origin: string;
  path: string;
};
type Thread = {
  thread_id: string;
  tab_id: number;
  scope: PageScope;
  next: number;
  terminal: boolean;
  events: ChatEvent[];
};
type RunBinding = { thread_id: string; tab_id: number };
export type ChatSessionSnapshot = {
  schema_version: 1;
  session_id: string;
  threads: Array<{
    thread_id: string;
    tab_id: number;
    scope: PageScope;
    events: ChatEvent[];
  }>;
};

const maxThreads = 8;
const maxThreadBytes = 128 * 1024;
const maxSessionBytes = 1024 * 1024;
const persistent = (event: ChatEvent): boolean =>
  ![
    "action_review_required",
    "permission_required",
    "value_required",
    "confirmation_required",
  ].includes(event.type);
const bytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;
const clone = <T>(value: T): T => structuredClone(value);

/**
 * Browser-lifetime chat state. It intentionally never retains executable
 * approval/capability events; those belong only to a live worker run.
 */
export class TabChatSessionStore {
  private sessionId = opaqueId();
  private readonly threads = new Map<number, Thread>();
  private readonly runs = new Map<string, RunBinding>();
  private readonly finishedRuns = new Set<string>();

  public session_id(): string {
    return this.sessionId;
  }

  public ensureThread(tabId: number, scope: PageScope): Thread {
    const existing = this.threads.get(tabId);
    if (existing) {
      if (
        existing.scope.document_epoch !== scope.document_epoch ||
        existing.scope.page_scope_epoch !== scope.page_scope_epoch ||
        existing.scope.origin !== scope.origin ||
        existing.scope.path !== scope.path
      ) {
        if (!existing.terminal) existing.terminal = true;
        existing.scope = clone(scope);
        existing.events.push({
          type: "page_scope_changed",
          session_id: this.sessionId,
          thread_id: existing.thread_id,
          tab_id: tabId,
          run_id: "page-scope",
          sequence: existing.next++,
        });
      }
      return existing;
    }
    if (this.threads.size >= maxThreads) return fail("THREAD_LIMIT_REACHED");
    const thread: Thread = {
      thread_id: opaqueId(),
      tab_id: tabId,
      scope: clone(scope),
      next: 1,
      terminal: false,
      events: [],
    };
    this.threads.set(tabId, thread);
    return thread;
  }

  public bindRun(runId: string, tabId: number, scope: PageScope): void {
    const thread = this.ensureThread(tabId, scope);
    this.runs.set(runId, { thread_id: thread.thread_id, tab_id: tabId });
    this.finishedRuns.delete(runId);
    thread.terminal = false;
  }

  public append(runId: string, payload: ChatEventPayload): ChatEvent {
    const binding = this.runs.get(runId);
    const thread = binding ? this.threads.get(binding.tab_id) : undefined;
    if (!binding || !thread || this.finishedRuns.has(runId))
      return fail("INVALID_ARGUMENT");
    const sanitized =
      payload.type === "user_message" || payload.type === "assistant_delta"
        ? { ...payload, text: redactForChat(payload.text) }
        : payload.type === "tool_started" || payload.type === "tool_progress"
          ? {
              ...payload,
              summary: redactForChat(payload.summary, 512),
              ...(payload.type === "tool_started" &&
              typeof payload.target_name === "string"
                ? { target_name: redactForChat(payload.target_name, 512) }
                : {}),
            }
          : payload.type === "tool_finished"
            ? {
                ...payload,
                result: {
                  ...payload.result,
                  summary: redactForChat(payload.result.summary, 512),
                },
              }
            : payload;
    const event = validateChatEvent({
      ...sanitized,
      session_id: this.sessionId,
      thread_id: binding.thread_id,
      tab_id: binding.tab_id,
      run_id: runId,
      sequence: thread.next++,
    });
    thread.events.push(event);
    if (event.type === "run_terminal") {
      thread.terminal = true;
      this.finishedRuns.add(runId);
    }
    this.assertQuota();
    return clone(event);
  }

  public has(runId: string): boolean {
    return this.runs.has(runId);
  }

  public terminal(runId: string): boolean {
    return this.finishedRuns.has(runId);
  }

  /**
   * Event sequences belong to a tab thread, not an individual run. A panel
   * that missed an event must therefore receive the rest of that thread's
   * timeline, including events from an earlier run.
   */
  public sinceThreadForRun(runId: string, sequence = 0): ChatEvent[] {
    const binding = this.runs.get(runId);
    const thread = binding ? this.threads.get(binding.tab_id) : undefined;
    if (!thread || !Number.isInteger(sequence) || sequence < 0)
      return fail("INVALID_ARGUMENT");
    return this.recoverable(thread.tab_id).filter(
      (event) => event.sequence > sequence,
    );
  }

  public recoverable(tabId: number): ChatEvent[] {
    return (
      (this.threads.get(tabId)?.events ?? [])
        // Approval events must never outlive a worker restart, but a newly
        // connected side panel still needs the live proposal in order to show
        // its approval controls. Once the run becomes terminal, retain only the
        // non-executable transcript events just as a restored session does.
        .filter(
          (event) => persistent(event) || !this.finishedRuns.has(event.run_id),
        )
        .map(clone)
    );
  }

  public scope(tabId: number): PageScope | undefined {
    const scope = this.threads.get(tabId)?.scope;
    return scope ? clone(scope) : undefined;
  }

  public context(
    tabId: number,
  ): Array<{ role: "user" | "assistant"; content: string }> {
    return (this.threads.get(tabId)?.events ?? [])
      .reduce<Array<{ role: "user" | "assistant"; content: string }>>(
        (messages, event) => {
          if (event.type === "user_message")
            messages.push({ role: "user", content: event.text });
          if (event.type === "assistant_delta")
            messages.push({ role: "assistant", content: event.text });
          return messages;
        },
        [],
      )
      .slice(-24);
  }

  public snapshot(): ChatSessionSnapshot {
    return {
      schema_version: 1,
      session_id: this.sessionId,
      threads: [...this.threads.values()].map((thread) => ({
        thread_id: thread.thread_id,
        tab_id: thread.tab_id,
        scope: clone(thread.scope),
        events: thread.events.filter(persistent).map(clone),
      })),
    };
  }

  public clear(): void {
    this.threads.clear();
    this.runs.clear();
    this.finishedRuns.clear();
    this.sessionId = opaqueId();
  }

  public removeTab(tabId: number): void {
    this.threads.delete(tabId);
    for (const [runId, binding] of this.runs)
      if (binding.tab_id === tabId) this.runs.delete(runId);
    for (const runId of this.finishedRuns) {
      const binding = this.runs.get(runId);
      if (!binding || binding.tab_id === tabId) this.finishedRuns.delete(runId);
    }
  }

  public restore(value: unknown): void {
    if (
      typeof value !== "object" ||
      value === null ||
      (value as { schema_version?: unknown }).schema_version !== 1 ||
      typeof (value as { session_id?: unknown }).session_id !== "string" ||
      !Array.isArray((value as { threads?: unknown }).threads)
    )
      return;
    const restored = new Map<number, Thread>();
    for (const candidate of (value as { threads: unknown[] }).threads) {
      if (
        typeof candidate !== "object" ||
        candidate === null ||
        typeof (candidate as { thread_id?: unknown }).thread_id !== "string" ||
        !Number.isInteger((candidate as { tab_id?: unknown }).tab_id) ||
        !Array.isArray((candidate as { events?: unknown }).events)
      )
        continue;
      try {
        const events = (candidate as { events: unknown[] }).events.map(
          validateChatEvent,
        );
        if (events.some((event) => !persistent(event))) continue;
        const scope = (candidate as { scope?: unknown }).scope;
        if (
          typeof scope !== "object" ||
          scope === null ||
          !["document_epoch", "page_scope_epoch", "origin", "path"].every(
            (key) =>
              typeof (scope as Record<string, unknown>)[key] === "string",
          )
        )
          continue;
        const tabId = (candidate as { tab_id: number }).tab_id;
        restored.set(tabId, {
          thread_id: (candidate as { thread_id: string }).thread_id,
          tab_id: tabId,
          scope: clone(scope as PageScope),
          next: Math.max(0, ...events.map((event) => event.sequence)) + 1,
          terminal: true,
          events,
        });
      } catch {
        continue;
      }
    }
    this.threads.clear();
    this.runs.clear();
    this.finishedRuns.clear();
    this.sessionId = (value as { session_id: string }).session_id;
    for (const [tabId, thread] of restored) this.threads.set(tabId, thread);
  }

  private assertQuota(): void {
    for (const thread of this.threads.values()) {
      if (bytes(thread.events.filter(persistent)) > maxThreadBytes)
        return fail("CHAT_STORAGE_QUOTA_EXCEEDED");
    }
    if (bytes(this.snapshot()) > maxSessionBytes)
      return fail("CHAT_STORAGE_QUOTA_EXCEEDED");
  }
}

export const safeChatText = (value: string): string => redactForChat(value);
