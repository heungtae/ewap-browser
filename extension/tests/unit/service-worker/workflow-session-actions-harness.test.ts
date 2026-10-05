import { describe, expect, it, vi } from "vitest";
import { createWorkflowSessionActions } from "../../../src/service-worker/workflow-session-actions.js";
import {
  consumeStoredApproval,
  getHarnessApprovalStore,
} from "../../../src/page-act-harness/approval-store.js";
import type { ActSession } from "../../../src/service-worker/act-session-types.js";

const clickDefinition = {
  tool: "click_by_ref",
  effect: "local-ui-only",
  risk: "R1",
  eligible_roles: ["button"],
  verifier: {
    kind: "semantic-state-transition",
    declaration_id: "click-v1",
    pre_state_digest: "digest",
    required_changes: [],
  },
} as const;

const selectionBase = () => ({
  id: "selection-abcdefghijkl",
  tabId: 7,
  origin: "https://app.test",
  path: "/items",
  documentEpoch: "epoch-abcdefghijklmnop",
  prompt: "Search query에 browser test를 입력해줘.",
  profile: { id: "profile", version: 1 },
  profileDefinitions: [{ ...clickDefinition }],
  candidates: new Map([
    [
      "candidate-aaaaaaaaaaaaa1",
      {
        candidate: {
          id: "candidate-aaaaaaaaaaaaa1",
          source: "recorded",
          title: "Preview",
          origin: "https://app.test",
          path_prefix: "/items",
          step_count: 3,
          status: "verified",
          detail: "recorded",
        },
        declaration: {
          schema_version: 1,
          id: "preview-v1",
          title: "Preview",
          steps: [
            {
              id: "step-aaaaaaaaaaaaaa1",
              tool: "click_by_ref",
              target: { role: "button", name: "Generate" },
            },
          ],
        },
      },
    ],
  ]),
});

describe("workflow session harness propagation", () => {
  it("starts_selected_workflows_behind_a_pending_review_with_an_approval", async () => {
    const sessions = new Map<string, ActSession>();
    let captured: ActSession | undefined;
    const actions = createWorkflowSessionActions({
      selections: new Map([[selectionBase().id, selectionBase() as never]]),
      sessions,
      persist: async () => undefined,
      createId: () => "approval-start-aaaaaaaa",
      runStep: vi.fn(async (session: ActSession) => {
        captured = session;
        return { ok: true };
      }),
      safeFailure: (code: string) => ({ ok: false, code }),
    });
    const current = selectionBase() as never;
    const baseSelection = selectionBase();
    await actions.start(
      current,
      {
        candidate: {
          id: "candidate-aaaaaaaaaaaaa1",
          source: "recorded",
          status: "verified",
        },
        declaration: (baseSelection.candidates.get("candidate-aaaaaaaaaaaaa1")
          ?.declaration ?? {}) as never,
      },
      vi.fn(),
    );
    await vi.waitFor(() =>
      expect(captured?.harnessReview?.status).toBe("PENDING_REVIEW"),
    );
    expect(captured?.harnessReview).toMatchObject({
      candidate_id: "candidate-aaaaaaaaaaaaa1",
      source: "saved",
      status: "PENDING_REVIEW",
    });
    expect(captured?.harnessReview?.stored_scope).toEqual({
      origin: "https://app.test",
      path: "/items",
    });
    // The review approval is granted lazily by the gate with the session's
    // effective revision — no store record exists yet at selection time.
    expect(() =>
      consumeStoredApproval(
        getHarnessApprovalStore(),
        captured?.harnessReview?.approval_id ?? "",
        {
          plan_id: "candidate-aaaaaaaaaaaaa1",
          plan_revision: 0,
          request_revision: 1,
          binding_current: true,
        },
      ),
    ).toThrow("APPROVAL_NOT_FOUND");
  });

  it("dismisses_to_the_generic_path_with_declared_capabilities_only", async () => {
    const sessions = new Map<string, ActSession>();
    let captured: ActSession | undefined;
    const actions = createWorkflowSessionActions({
      selections: new Map([[selectionBase().id, selectionBase() as never]]),
      sessions,
      persist: async () => undefined,
      createId: () => "session-dismiss-aaaa",
      runStep: vi.fn(async (session: ActSession) => {
        captured = session;
        return { ok: true };
      }),
      safeFailure: (code: string) => ({ ok: false, code }),
    });
    await actions.dismiss(
      selectionBase() as never,
      {
        snapshot: {
          schema_version: 2,
          document_epoch: "epoch-abcdefghijklmnop",
          frame_id: 0,
          visible_text: "",
          nodes: [
            {
              ref_id: "node-abcdefghijklmnop",
              role: "button",
              name: "Generate",
              state: {},
              visible: true,
              enabled: true,
            },
          ],
        },
      } as never,
      vi.fn(),
    );
    await vi.waitFor(() => expect(captured?.harnessCapabilities).toBeDefined());
    expect(captured?.harnessCapabilities?.propose_tools).toEqual([
      "propose_click",
    ]);
    expect(captured?.harnessCapabilities?.entry_roles).toEqual(["button"]);
    expect(captured?.harnessReview).toBeUndefined();
  });
});
