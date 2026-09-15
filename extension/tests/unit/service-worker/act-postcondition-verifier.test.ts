import { describe, expect, it } from "vitest";
import { createActPostconditionVerifier } from "../../../src/service-worker/act-postcondition-verifier.js";
import type { Run } from "../../../src/state/run-coordinator.js";

const run: Run = {
  id: "run-abcdefghijklmnop",
  tabId: 7,
  frameId: 0,
  documentEpoch: "epoch-before-abcdefghijkl",
  mode: "act",
  tabContext: "context-abcdefghijkl",
  phase: "VERIFYING_NAVIGATION",
};

describe("Act postcondition verifier", () => {
  it("reidentifies_a_replaced_target_only_when_its_semantic_identity_is_unique", async () => {
    const verifier = createActPostconditionVerifier({
      readAll: async () => ({
        tabId: 7,
        snapshot: {
          document_epoch: run.documentEpoch,
          nodes: [
            {
              ref_id: "replacement-abcdefghijkl",
              role: "button",
              name: "조회",
              state: { expanded: true },
            },
          ],
        },
      }),
      send: async () => ({}),
      tab: async () => ({}),
    });
    await expect(
      verifier.evaluate(run, {
        tool: "click_by_ref",
        run_id: run.id,
        tab_id: run.tabId,
        frame_id: run.frameId,
        document_epoch: run.documentEpoch,
        profile: { id: "profile", version: 1 },
        ref_id: "target-before-abcdefghijkl",
        verification_target: { role: "button", name: "조회" },
        risk: "R1",
        effect: "local-ui-only",
        verifier: {
          kind: "semantic-state-transition",
          declaration_id: "expand-v1",
          pre_state_digest: "different-before-state",
          required_changes: [
            {
              ref_id: "target-before-abcdefghijkl",
              field: "expanded",
              expected: true,
            },
          ],
        },
      }),
    ).resolves.toEqual({
      status: "satisfied",
      reason: "EXPECTED_STATE_MATCHED",
    });
  });

  it("rejects_a_click_without_a_declared_completion_before_dispatch", () => {
    const verifier = createActPostconditionVerifier({
      readAll: async () => ({
        tabId: 7,
        snapshot: { document_epoch: run.documentEpoch, nodes: [] },
      }),
      send: async () => ({}),
      tab: async () => ({}),
    });
    expect(
      verifier.canVerify({
        tool: "click_by_ref",
        run_id: run.id,
        tab_id: run.tabId,
        frame_id: run.frameId,
        document_epoch: run.documentEpoch,
        profile: { id: "profile", version: 1 },
        ref_id: "target-before-abcdefghijkl",
        risk: "R1",
        effect: "local-ui-only",
        verifier: {
          kind: "semantic-state-transition",
          declaration_id: "empty-v1",
          pre_state_digest: "before",
          required_changes: [],
        },
      }),
    ).toBe(false);
  });

  it("verifies_a_profile_ui_marker_only_after_it_was_absent_before_dispatch", async () => {
    let reads = 0;
    const intent = {
      tool: "click_by_ref" as const,
      run_id: run.id,
      tab_id: run.tabId,
      frame_id: run.frameId,
      document_epoch: run.documentEpoch,
      profile: { id: "profile", version: 1 },
      ref_id: "target-before-abcdefghijkl",
      risk: "R1" as const,
      effect: "local-ui-only" as const,
      verifier: {
        kind: "semantic-state-transition" as const,
        declaration_id: "dialog-v2",
        pre_state_digest: "before",
        required_changes: [],
      },
      completion: {
        version: 2 as const,
        kind: "ui_relation" as const,
        source: "trusted_profile" as const,
        scope_policy: "same_scope" as const,
        report_scope: "ui" as const,
        marker: { role: "dialog" as const, name: "조회 결과" },
      },
    };
    const verifier = createActPostconditionVerifier({
      readAll: async () => ({
        tabId: run.tabId,
        snapshot: {
          document_epoch: run.documentEpoch,
          nodes:
            reads++ === 0
              ? []
              : [
                  {
                    ref_id: "dialog-after-abcdefghijkl",
                    role: "dialog",
                    name: "조회 결과",
                    visible: true,
                    state: {},
                  },
                ],
        },
      }),
      send: async () => ({}),
      tab: async () => ({}),
    });
    await expect(verifier.prepare(run, intent)).resolves.toBe(true);
    await expect(verifier.evaluate(run, intent)).resolves.toEqual({
      status: "satisfied",
      reason: "EXPECTED_STATE_MATCHED",
    });
  });

  it("requires_a_changed_scope_and_fresh_snapshot_after_a_url_transition", async () => {
    const milestones: string[] = [];
    let scopeReads = 0;
    const verifier = createActPostconditionVerifier({
      readAll: async () => ({
        tabId: 7,
        snapshot: {
          document_epoch: "epoch-after-abcdefghijkl",
          nodes: [{ ref_id: "node-abcdefghijklmnop", state: {} }],
        },
      }),
      send: async () => ({}),
      tab: async () => ({ url: "https://portal.company.test/after" }),
      scope: () => {
        scopeReads += 1;
        return scopeReads === 1
          ? {
              document_epoch: "epoch-before-abcdefghijkl",
              page_scope_epoch: "scope-before-abcdefghijkl",
            }
          : {
              document_epoch: "epoch-after-abcdefghijkl",
              page_scope_epoch: "scope-after-abcdefghijkl",
            };
      },
      milestone: (_tabId, stage) => milestones.push(stage),
    });

    await expect(
      verifier.waitForPageTransition(
        run,
        "https://portal.company.test/before",
        "https://portal.company.test",
      ),
    ).resolves.toBe(true);
    expect(milestones).toEqual(["URL_OR_SCOPE_CHANGED", "SNAPSHOT_VALIDATED"]);
  });

  it("uses_the_scope_captured_before_a_fast_same_document_transition", async () => {
    const verifier = createActPostconditionVerifier({
      readAll: async () => ({
        tabId: 7,
        snapshot: {
          // A SPA route keeps document_epoch stable; only page scope changes.
          document_epoch: run.documentEpoch,
          nodes: [{ ref_id: "node-abcdefghijklmnop", state: {} }],
        },
      }),
      send: async () => ({}),
      tab: async () => ({ url: "https://portal.company.test/after" }),
      // By verification time the lifecycle event has already replaced this.
      scope: () => ({
        document_epoch: run.documentEpoch,
        page_scope_epoch: "scope-after-abcdefghijkl",
      }),
    });

    await expect(
      verifier.waitForPageTransition(
        run,
        "https://portal.company.test/before",
        "https://portal.company.test",
        undefined,
        {
          document_epoch: run.documentEpoch,
          page_scope_epoch: "scope-before-abcdefghijkl",
        },
      ),
    ).resolves.toBe(true);
  });
});
