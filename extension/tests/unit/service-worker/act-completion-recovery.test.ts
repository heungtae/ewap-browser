import { afterEach, describe, expect, it, vi } from "vitest";
import {
  validActCompletion,
  type ActCompletion,
} from "../../../src/contracts/act-completion.js";
import { validateChatEvent } from "../../../src/contracts/chat-events.js";
import { TabChatSessionStore } from "../../../src/state/tab-chat-session-store.js";
import { ChatRequestLifecycle } from "../../../src/service-worker/chat-request-lifecycle.js";
import { RequestPersistence } from "../../../src/service-worker/request-persistence.js";
import { actCompletionView } from "../../../src/sidepanel/act-completion-view.js";

const completion: ActCompletion = {
  action_outcome: "VERIFIED",
  goal_status: "unknown",
  reason: "REASSESSMENT_LIMIT",
  reassessments: 2,
};
const input = {
  request_id: "c2f597ec-1096-4e99-8e2e-2c43b05c0dfb",
  tab_id: 7,
  prompt: "private prompt",
  mode: "act" as const,
  owner: "owner",
};
const scope = {
  origin: "https://fixture.test",
  path: "/",
  document_epoch: "document-abcdefghijklmnop",
  page_scope_epoch: "scope-abcdefghijklmnop",
};
afterEach(() => vi.useRealTimers());
describe("completion wire, recovery and presentation", () => {
  it("R13/R14 keeps safe completion fields in validated events, persistence and diagnostics", () => {
    const store = new TabChatSessionStore();
    store.bindRun("run-abcdefghijklmnop", 7, scope);
    const event = store.append("run-abcdefghijklmnop", {
      type: "run_terminal",
      outcome: "UNKNOWN",
      code: "GOAL_UNVERIFIED",
      completion,
    });
    expect(validateChatEvent(event)).toEqual(event);
    const restored = new TabChatSessionStore();
    restored.restore(store.snapshot());
    expect(restored.recoverable(7)[0]).toMatchObject({ completion });
    expect(JSON.stringify(restored.diagnosticSnapshot(7))).toContain(
      "REASSESSMENT_LIMIT",
    );
    expect(
      actCompletionView(
        event.type === "run_terminal" ? event.completion : undefined,
      ),
    ).toEqual(
      actCompletionView(
        restored.recoverable(7)[0]?.type === "run_terminal"
          ? completion
          : undefined,
      ),
    );
    expect(validActCompletion({ ...completion, raw_text: "secret" })).toBe(
      false,
    );
    expect(() =>
      validateChatEvent({
        ...event,
        completion: { ...completion, raw_text: "secret" },
      }),
    ).toThrow();
    expect(
      validActCompletion({
        ...completion,
        action_outcome: "FAILED",
        goal_status: "completed",
      }),
    ).toBe(false);
    expect(validActCompletion({ ...completion, reassessments: 3 })).toBe(false);
    expect(
      validateChatEvent({ ...event, completion: undefined }),
    ).toMatchObject({ outcome: "UNKNOWN" });
  });
  it("R13 preserves final goal outcome instead of interpreting ok as goal success", async () => {
    vi.useFakeTimers();
    let saved: Record<string, unknown> = {};
    const persistence = new RequestPersistence({
      get: async () => saved,
      set: async (value) => {
        saved = value;
      },
    });
    const requests = new ChatRequestLifecycle(undefined, persistence);
    requests.start(input);
    const generation = requests.startRun(input.request_id)!;
    requests.completion(7, {
      ...completion,
      goal_status: "checking",
      reason: "OBSERVING",
      reassessments: 0,
    });
    requests.progress(7, "VERIFYING_RESULT");
    requests.settled(input.request_id, generation, {
      ok: true,
      outcome: "UNKNOWN",
      code: "GOAL_UNVERIFIED",
      completion,
    });
    await requests.flush();
    const restored = new ChatRequestLifecycle(undefined, persistence);
    await restored.restore();
    const status = restored.status(input.request_id, 7, input.owner)!;
    expect(status).toMatchObject({
      state: "TERMINAL",
      outcome: "UNKNOWN",
      code: "GOAL_UNVERIFIED",
      completion,
    });
    expect(actCompletionView(status.completion)).toMatchObject({
      active: false,
      message: "동작은 완료했습니다. 최종 화면 확인이 필요합니다.",
    });
    expect(JSON.stringify(saved)).not.toContain("private prompt");
    expect(restored.diagnosticSnapshot(input.request_id, 7)).toMatchObject({
      completion,
    });
  });
  it("R09 worker restart retains action evidence but discards checking goal state", async () => {
    vi.useFakeTimers();
    let saved: Record<string, unknown> = {};
    const persistence = new RequestPersistence({
      get: async () => saved,
      set: async (value) => {
        saved = value;
      },
    });
    const first = new ChatRequestLifecycle(undefined, persistence);
    first.start(input);
    first.startRun(input.request_id);
    await first.beforeDispatch(7);
    first.completion(7, {
      ...completion,
      goal_status: "checking",
      reason: "OBSERVING",
    });
    first.progress(7, "VERIFYING_RESULT");
    await first.flush();
    const restored = new ChatRequestLifecycle(undefined, persistence);
    await restored.restore();
    expect(restored.status(input.request_id, 7, input.owner)).toMatchObject({
      outcome: "UNKNOWN",
      code: "WORKER_RESTARTED",
      completion: {
        action_outcome: "VERIFIED",
        goal_status: "unknown",
        reason: "REQUEST_ENDED",
      },
    });
    expect(restored.startRun(input.request_id)).toBeUndefined();
  });
  it("R09 stop rejects late completion and R13 preserves legacy display", () => {
    vi.useFakeTimers();
    const requests = new ChatRequestLifecycle();
    requests.start(input);
    const generation = requests.startRun(input.request_id)!;
    requests.completion(7, { ...completion, goal_status: "checking" });
    requests.cancel(input.request_id, 7, input.owner);
    requests.settled(input.request_id, generation, {
      ok: true,
      outcome: "VERIFIED",
      completion: { ...completion, goal_status: "completed" },
    });
    expect(
      requests.status(input.request_id, 7, input.owner)?.completion
        ?.goal_status,
    ).toBe("unknown");
    expect(actCompletionView()).toBeUndefined();
    expect(
      actCompletionView({ ...completion, action_outcome: "FAILED" }),
    ).toBeUndefined();
  });
});
