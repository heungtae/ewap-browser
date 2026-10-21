import { reduceOrchestration } from "./reduce.js";
import type {
  Orchestration,
  OrchestrationStore,
  Transition,
} from "./contracts.js";
export async function advanceTask(
  state: Orchestration,
  event: Transition,
  store: OrchestrationStore,
  now: number,
): Promise<Orchestration> {
  const next = reduceOrchestration(state, event, now);
  await store.commit(
    structuredClone({
      previousRevision: state.context.taskRevision,
      transition: event,
      state: next,
    }),
  );
  return next;
}
