import { expect, it, vi } from "vitest";
import { createActPostconditionVerifier } from "../../../src/service-worker/act-postcondition-verifier.js";
import type { ActionIntent } from "../../../src/contracts/action-types.js";
import type { Run } from "../../../src/state/run-coordinator.js";

it("R07 rejects render_result without authoritative generation even with an old success toast and state predicate", async () => {
  const send = vi.fn(async () => ({ ok: true, matches: true }));
  const run = {
    id: "run-abcdefghijklmnop",
    tabId: 7,
    frameId: 0,
    documentEpoch: "epoch-abcdefghijklmnop",
  } as Run;
  const intent: ActionIntent = {
    tool: "click_by_ref",
    run_id: run.id,
    tab_id: 7,
    frame_id: 0,
    document_epoch: run.documentEpoch,
    profile: { id: "trusted", version: 1 },
    ref_id: "target",
    risk: "R1",
    effect: "local-ui-only",
    verifier: {
      kind: "semantic-state-transition",
      declaration_id: "save",
      pre_state_digest: "before",
      required_changes: [
        { ref_id: "target", field: "disabled", expected: true },
      ],
    },
    completion: {
      version: 2,
      kind: "render_result",
      source: "trusted_profile",
      scope_policy: "same_scope",
      report_scope: "result",
      requires_result_generation: true,
      marker: { role: "status", name: "Saved" },
    },
  };
  const verifier = createActPostconditionVerifier({
    readAll: async () => ({
      tabId: 7,
      snapshot: {
        document_epoch: run.documentEpoch,
        nodes: [
          {
            ref_id: "toast",
            role: "status",
            name: "Saved",
            visible: true,
            state: {},
          },
        ],
      },
    }),
    send,
    tab: async () => ({}),
  });
  expect(verifier.canVerify(intent)).toBe(false);
  expect(await verifier.prepare(run, intent)).toBe(false);
  expect(await verifier.prepareBrowserUi(run, intent)).toBe(false);
  expect(await verifier.evaluate(run, intent)).toMatchObject({
    status: "invalid",
    reason: "CONTRACT_INVALID",
  });
  expect(send).not.toHaveBeenCalled();
});
