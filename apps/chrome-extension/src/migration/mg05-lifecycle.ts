import type { ChatRequestLifecycle } from "../../../../extension/src/service-worker/chat-request-lifecycle.js";
import type { LegacyDrainPort } from "./mg05-drain.js";
// Bind to the existing lifecycle/cancellation path; no alternate executor.
export function lifecycleDrainPort(input: {
  epoch: number;
  requests: Pick<ChatRequestLifecycle, "status" | "endTab" | "flush">;
  assertFrozen(epoch: number): Promise<void>;
  cancelRun(tabId: number): void;
  revokeSelections(signal: AbortSignal): Promise<number>;
  remainingActive(signal: AbortSignal): Promise<number>;
  reconcileOwnedCdp(signal: AbortSignal): Promise<number>;
}): LegacyDrainPort {
  const check = async (signal: AbortSignal) => {
    if (signal.aborted) throw new Error("MG05_DRAIN_ABORTED");
    await input.assertFrozen(input.epoch);
    if (signal.aborted) throw new Error("MG05_DRAIN_ABORTED");
  };
  return {
    assertFrozen: async (epoch) => {
      if (epoch !== input.epoch) throw new Error("MG05_EPOCH");
      await input.assertFrozen(epoch);
    },
    async cancelRequest(row, signal) {
      await check(signal);
      const live = () =>
        input.requests.status(row.request_id, row.tab_id, row.owner);
      if (live()?.state !== "TERMINAL" && live() !== undefined) {
        input.cancelRun(row.tab_id);
        if (live()?.state !== "TERMINAL" && live() !== undefined)
          input.requests.endTab(row.tab_id, "CANCELLED");
        await input.requests.flush();
      }
      await check(signal);
    },
    async readRequest(row, signal) {
      await check(signal);
      const found = input.requests.status(
        row.request_id,
        row.tab_id,
        row.owner,
      );
      return found ? { ...found, owner: row.owner } : undefined;
    },
    async revokeSelections(signal) {
      await check(signal);
      return input.revokeSelections(signal);
    },
    async remainingActive(signal) {
      await check(signal);
      return input.remainingActive(signal);
    },
    async reconcileOwnedCdp(signal) {
      await check(signal);
      return input.reconcileOwnedCdp(signal);
    },
  };
}
