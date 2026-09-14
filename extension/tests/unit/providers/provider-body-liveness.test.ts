import { afterEach, describe, expect, it, vi } from "vitest";
import { parseProviderBody } from "../../../src/providers/provider-body.js";
afterEach(() => vi.useRealTimers());
describe("provider body liveness", () => {
  it("cancels a stalled reader at the idle deadline", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const result = parseProviderBody(new ReadableStream({ cancel }));
    const checked = expect(result).rejects.toThrow(
      "PROVIDER_BODY_IDLE_TIMEOUT",
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await checked;
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("honors an already aborted signal and cancels the reader", async () => {
    const controller = new AbortController();
    controller.abort();
    const cancel = vi.fn();
    await expect(
      parseProviderBody(
        new ReadableStream({ cancel }),
        undefined,
        controller.signal,
      ),
    ).rejects.toThrow("PROVIDER_UNAVAILABLE");
    expect(cancel).toHaveBeenCalledOnce();
  });
});
