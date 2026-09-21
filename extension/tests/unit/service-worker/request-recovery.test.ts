import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatRequestLifecycle } from "../../../src/service-worker/chat-request-lifecycle.js";
import { ExecutionDiagnostics } from "../../../src/service-worker/execution-diagnostics.js";
import { RequestPersistence } from "../../../src/service-worker/request-persistence.js";
const input = {
  request_id: "c2f597ec-1096-4e99-8e2e-2c43b05c0dfb",
  tab_id: 7,
  prompt: "secret prompt",
  mode: "act" as const,
  owner: "panel:document-epoch",
};
afterEach(() => vi.useRealTimers());
describe("request recovery and cancellation", () => {
  it("restores an interrupted request without its prompt and never reruns it", async () => {
    vi.useFakeTimers();
    let data: Record<string, unknown> = {};
    const storage = new RequestPersistence({
      get: async () => data,
      set: async (value) => {
        data = structuredClone(value);
      },
    });
    const first = new ChatRequestLifecycle(undefined, storage);
    first.start(input);
    first.startRun(input.request_id);
    await first.flush();
    expect(JSON.stringify(data)).not.toContain("secret prompt");
    const diagnostics = new ExecutionDiagnostics();
    const second = new ChatRequestLifecycle(diagnostics, storage);
    await second.restore();
    expect(second.status(input.request_id, 7, input.owner)).toMatchObject({
      state: "TERMINAL",
      outcome: "FAILED",
      code: "WORKER_RESTARTED",
    });
    expect(second.start(input).kind).toBe("existing");
    expect(second.startRun(input.request_id)).toBeUndefined();
    expect(diagnostics.list(input.request_id, 7, 0, 100)?.records).toEqual([
      expect.objectContaining({
        event: "request.restored",
        level: "error",
        code: "WORKER_RESTARTED",
        reason: "worker_restarted",
      }),
    ]);
  });
  it("retains UNKNOWN after dispatch cancellation and rejects late results", async () => {
    vi.useFakeTimers();
    const requests = new ChatRequestLifecycle();
    requests.start(input);
    const generation = requests.startRun(input.request_id)!;
    const context = requests.context(input.request_id);
    await requests.beforeDispatch(7);
    requests.cancel(input.request_id, 7, input.owner);
    requests.finish(input.request_id, generation, "VERIFIED");
    expect(context.signal.aborted).toBe(true);
    expect(() => context.check()).toThrow();
    expect(requests.status(input.request_id, 7, input.owner)?.outcome).toBe(
      "UNKNOWN",
    );
  });
  it("keeps approval pending and pauses the automatic budget", async () => {
    vi.useFakeTimers();
    const requests = new ChatRequestLifecycle();
    requests.start(input);
    const generation = requests.startRun(input.request_id)!;
    await vi.advanceTimersByTimeAsync(100_000);
    requests.progress(7, "AWAITING_REVIEW");
    requests.settled(input.request_id, generation, { ok: true });
    await vi.advanceTimersByTimeAsync(100_000);
    expect(requests.status(input.request_id, 7, input.owner)?.state).toBe(
      "WAITING_USER",
    );
    requests.progress(7, "CONTACTING_PROVIDER");
    await vi.advanceTimersByTimeAsync(80_001);
    expect(requests.status(input.request_id, 7, input.owner)).toMatchObject({
      state: "TERMINAL",
      code: "REQUEST_TIMEOUT",
    });
  });
  it("denies other panel instances and document epochs", () => {
    const diagnostics = new ExecutionDiagnostics();
    const requests = new ChatRequestLifecycle(diagnostics);
    requests.start(input);
    expect(requests.status(input.request_id, 7, "other:epoch")).toBeUndefined();
    expect(requests.cancel(input.request_id, 7, "other:epoch")).toBeUndefined();
    expect(diagnostics.list(input.request_id, 7, 0, 100)?.records).toEqual([
      expect.objectContaining({
        event: "request.status_rejected",
        level: "error",
        code: "REQUEST_NOT_FOUND",
        reason: "panel_context_changed",
      }),
    ]);
  });
  it("does not dispatch when the marker cannot be persisted", async () => {
    vi.useFakeTimers();
    const requests = new ChatRequestLifecycle(
      undefined,
      new RequestPersistence({
        get: async () => ({}),
        set: async () => {
          throw new Error("quota");
        },
      }),
    );
    requests.start(input);
    requests.startRun(input.request_id);
    await expect(requests.beforeDispatch(7)).rejects.toThrow(
      "STORAGE_BOUNDARY_UNAVAILABLE",
    );
    expect(requests.status(input.request_id, 7, input.owner)?.outcome).toBe(
      "FAILED",
    );
  });
});
