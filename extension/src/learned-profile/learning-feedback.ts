import type { LearningTicket } from "./types.js";
import type { createLearnedProfileStore } from "./store.js";
type LearnedStore = ReturnType<typeof createLearnedProfileStore>;
export function createLearningFeedback(
  opts: {
    store: LearnedStore;
    ticket: LearningTicket;
    notify?(status: "FALLBACK" | "STORE_FAILED"): void;
  },
  consumed: () => string | undefined,
) {
  let failures = 0,
    repairEligible = false;
  let pending = Promise.resolve();
  return {
    get failed() {
      return failures > 0;
    },
    get eligible() {
      return failures === 0 || (repairEligible && failures === 1);
    },
    record(recoverable = true) {
      failures++;
      opts.notify?.("FALLBACK");
      const id = consumed();
      if (id && failures === 1) {
        repairEligible = recoverable;
        pending = opts.store
          .feedback(opts.ticket, id)
          .then((next) => {
            if (next) opts.ticket = next;
            else repairEligible = false;
          })
          .catch(() => {
            repairEligible = false;
            opts.notify?.("STORE_FAILED");
          });
      }
      if (!recoverable) failures = 2;
    },
    async ready() {
      await pending;
      return {
        ticket: opts.ticket,
        eligible: failures === 0 || (repairEligible && failures === 1),
      };
    },
  };
}
