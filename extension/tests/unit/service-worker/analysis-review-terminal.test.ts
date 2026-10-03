import { expect, it } from "vitest";
import { ChatRequestLifecycle } from "../../../src/service-worker/chat-request-lifecycle.js";

it.each(["running", "verified", "cancelled"])(
  "delivers review-only metadata after %s without reviving cancellation",
  (state) => {
    const requests = new ChatRequestLifecycle();
    const id = crypto.randomUUID();
    requests.start({
      request_id: id,
      tab_id: 9,
      mode: "ask",
      prompt: "Analyze data",
    });
    const generation = requests.startRun(id)!;
    if (state !== "running")
      requests.finish(
        id,
        generation,
        state === "verified" ? "VERIFIED" : "CANCELLED",
      );
    requests.settled(id, generation, {
      ok: true,
      state: "ANALYSIS_ADAPTER_REVIEW_REQUIRED",
      candidate_ref: "untrusted-extra",
    });
    expect(requests.status(id, 9)?.state).toBe("TERMINAL");
    expect(requests.result(id)).toEqual(
      state === "cancelled"
        ? undefined
        : { ok: true, state: "ANALYSIS_ADAPTER_REVIEW_REQUIRED" },
    );
  },
);
