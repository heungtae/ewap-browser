import { ChatRequestLifecycle } from "../../../../src/service-worker/chat-request-lifecycle.js";
import { RequestPersistence } from "../../../../src/service-worker/request-persistence.js";
import { lifecycleDrainPort } from "../../../../../apps/chrome-extension/src/migration/mg05-lifecycle.js";
import type { ExecutionSnapshot } from "../../../../../apps/chrome-extension/src/migration/mg05-convert.js";
export async function activeLegacy(dispatch = false) {
  const data: Record<string, unknown> = {};
  const requests = new ChatRequestLifecycle(
    undefined,
    new RequestPersistence({
      async get(key) {
        return { [key]: data[key] };
      },
      async set(value) {
        Object.assign(data, structuredClone(value));
      },
    }),
  );
  const id = "10000000-0000-4000-8000-000000000001";
  const owner = "panel:legacy-document";
  requests.start({
    request_id: id,
    tab_id: 7,
    mode: "act",
    prompt: "Fixture task",
    owner,
  });
  requests.startRun(id);
  if (dispatch) await requests.beforeDispatch(7);
  await requests.flush();
  let frozen = true,
    cancellations = 0,
    revoked = 0,
    unresolvedCdp = 0;
  const port = lifecycleDrainPort({
    epoch: 1,
    requests,
    async assertFrozen(epoch) {
      if (epoch !== 1 || !frozen) throw new Error("FENCE_REVOKED");
    },
    cancelRun() {
      cancellations++;
    },
    async revokeSelections() {
      revoked++;
      return 0;
    },
    async remainingActive() {
      return requests.activeContext(7) ? 1 : 0;
    },
    async reconcileOwnedCdp() {
      return unresolvedCdp;
    },
  });
  return {
    requests,
    data,
    port,
    id,
    owner,
    snapshot: () => structuredClone(data) as ExecutionSnapshot,
    status: () => requests.status(id, 7, owner),
    counts: () => ({ cancellations, revoked }),
    unfreeze() {
      frozen = false;
    },
    cdpUnknown() {
      unresolvedCdp = 1;
    },
    cleanup() {
      requests.endTab(7, "CANCELLED");
    },
  };
}
export function archivedRequest(patch: Record<string, unknown> = {}) {
  return {
    request_id: "20000000-0000-4000-8000-000000000001",
    revision: 1,
    state: "TERMINAL",
    stage: "TERMINAL",
    tab_id: 4,
    owner: "old-owner",
    started_at_ms: 0,
    stage_started_at_ms: 0,
    last_progress_at_ms: 0,
    outcome: "VERIFIED",
    ...patch,
  };
}
