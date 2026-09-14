import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestClient } from "../../../src/sidepanel/request-client.js";
afterEach(() => vi.useRealTimers());
const setup = (send: (value: unknown) => Promise<Record<string, unknown>>) => {
  const options = {
    send: vi.fn(send),
    update: vi.fn(),
    result: vi.fn(),
    failure: vi.fn(),
    connection: vi.fn(),
  };
  return { client: new RequestClient(options), ...options };
};
describe("request client recovery", () => {
  it("clears the completed Ask ID and cancels the subsequent Act ID", async () => {
    vi.useFakeTimers();
    let terminal = true;
    const { client, send } = setup(async (value) =>
      (value as { kind: string }).kind === "CHAT_REQUEST_STATUS"
        ? { request: { revision: 1, state: terminal ? "TERMINAL" : "RUNNING" } }
        : { accepted: true },
    );
    await client.start("question", "ask");
    expect(client.requestId).toBeUndefined();
    terminal = false;
    await client.start("action", "act");
    const id = client.requestId;
    await client.cancel();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "CHAT_REQUEST_CANCEL", request_id: id }),
    );
    client.reset();
  });
  it("observes a snapshot failure without a chat terminal event", async () => {
    const { client, update } = setup(async (value) =>
      (value as { kind: string }).kind === "CHAT_REQUEST_STATUS"
        ? {
            request: {
              revision: 3,
              state: "TERMINAL",
              outcome: "FAILED",
              code: "PAGE_SNAPSHOT_TIMEOUT",
            },
          }
        : { accepted: true },
    );
    await client.start("question", "ask");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "FAILED" }),
    );
    expect(client.requestId).toBeUndefined();
  });
  it("queries status after a lost ACK without resubmitting START", async () => {
    vi.useFakeTimers();
    const { client, send } = setup(async (value) =>
      (value as { kind: string }).kind === "CHAT_REQUEST_START"
        ? new Promise(() => undefined)
        : { request: { revision: 2, state: "TERMINAL", outcome: "VERIFIED" } },
    );
    const start = client.start("question", "ask");
    await vi.advanceTimersByTimeAsync(5_000);
    await start;
    expect(send.mock.calls.map(([v]) => (v as { kind: string }).kind)).toEqual([
      "CHAT_REQUEST_START",
      "CHAT_REQUEST_STATUS",
    ]);
  });
  it("does not let a delayed old response overwrite a new tab", async () => {
    let release!: (value: Record<string, unknown>) => void;
    const { client, update } = setup(async (value) =>
      (value as { kind: string }).kind === "CHAT_REQUEST_STATUS"
        ? new Promise((resolve) => {
            release = resolve;
          })
        : { accepted: true },
    );
    const start = client.start("question", "ask");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    client.reset();
    release({ request: { revision: 1, state: "RUNNING" } });
    await start;
    expect(update).not.toHaveBeenCalled();
  });
  it("shows missing status after restart rather than polling forever", async () => {
    const { client, failure } = setup(async (value) => {
      if ((value as { kind: string }).kind === "CHAT_REQUEST_STATUS")
        throw new Error("REQUEST_NOT_FOUND");
      return { accepted: true };
    });
    await client.start("question", "ask");
    expect(failure).toHaveBeenCalledWith("REQUEST_NOT_FOUND");
    expect(client.requestId).toBeUndefined();
  });
});
