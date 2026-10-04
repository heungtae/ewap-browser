import { describe, expect, it, vi } from "vitest";
import { ServiceCoordinator } from "../../../src/service-worker/coordinator.js";
import { prepareActProposal } from "../../../src/service-worker/act-proposal-readiness.js";
import type { ActSession } from "../../../src/service-worker/act-session-types.js";
import type { ParsedActProposal } from "../../../src/service-worker/act-proposal-parser.js";

import type { Run } from "../../../src/state/run-coordinator.js";

const policy = {
  permission_origins: ["<all_urls>"],
  page_read_origins: ["<all_urls>"],
  profile_resolver_origins: [],
  llm_egress_origins: [],
};

describe("Act proposal readiness", () => {
  it("binds a signed R2 confirmation to the Act chat session", () => {
    const coordinator = new ServiceCoordinator(policy);
    coordinator.completeStorageBootstrap(true);
    const run = coordinator.runs.start(1, 0, "epoch-abcdefghijklmnop", "act");
    const proposal: ParsedActProposal = {
      id: "proposal-abcdefghijkl",
      tool: "click_by_ref",
      refId: "target-abcdefghijklmnop",
      targetName: "Submit invoice",
      approvalScope: "single_step",
      approvalReason: "승인한 작업을 실행합니다.",
      toolCallId: "tool-call-abcdefghijkl",
      definition: {
        tool: "click_by_ref",
        effect: "server-side",
        risk: "R2",
        eligible_roles: ["button"],
        verifier: {
          kind: "semantic-state-transition",
          declaration_id: "invoice-submit-v1",
          pre_state_digest: "",
          required_changes: [
            { ref_id: "$target", field: "disabled", expected: true },
          ],
        },
      },
    };
    const session = {
      id: "session-abcdefghijkl",
      profile: { id: "signed-profile", version: 1 },
    } as ActSession;
    const published = vi.fn();

    const prepared = prepareActProposal(
      {
        coordinator,
        actionView: () => ({}) as never,
        publish: published,
      },
      session,
      run,
      proposal,
      {
        ref_id: proposal.refId,
        role: "button",
        name: "Submit invoice",
        enabled: true,
        visible: true,
        state: { disabled: false },
      },
    );

    expect(prepared).toEqual({
      response: {
        ok: true,
        state: "CONFIRMATION_REQUIRED",
        session_id: session.id,
        proposal_id: proposal.id,
      },
    });
    expect(published).toHaveBeenCalledWith(
      run.id,
      expect.objectContaining({ type: "confirmation_required" }),
    );
    expect(
      coordinator.mutations.confirm(
        run,
        session.awaitingConfirmation!.confirmationId,
        session.awaitingConfirmation!.confirmationNonce,
      ).state,
    ).toBe("READY_TO_EXECUTE");
  });
});

const fixture = (
  state: Record<string, boolean>,
  role: "button" | "tab" = "button",
  approvalScope: "session" | "single_step" = "single_step",
) => {
  const propose = vi.fn(() => ({ state: "READY_TO_EXECUTE" }));
  const session = {
    profile: { id: "page", version: 1 },
    id: "session",
  } as ActSession;
  const proposal = {
    id: "proposal",
    targetName: "Target",
    approvalReason: "Test",
    toolCallId: "tool",
    tool: "click_by_ref",
    refId: "ref",
    approvalScope,
    definition: {
      tool: "click_by_ref",
      effect: "local-ui-only",
      risk: "R1",
      eligible_roles: [role],
      verifier: {
        kind: "semantic-state-transition",
        declaration_id: "test",
        pre_state_digest: "before",
        required_changes: [],
      },
    },
  } as ParsedActProposal;
  prepareActProposal(
    {
      coordinator: { mutations: { propose, executeR1: () => ({}) } } as never,
      actionView: () => ({}) as never,
      publish: () => undefined,
    },
    session,
    {} as Run,
    proposal,
    {
      ref_id: "ref",
      name: "Target",
      role,
      visible: true,
      enabled: true,
      state,
    },
  );
  return {
    session,
    definition: (propose.mock.calls[0] as unknown as unknown[])[4] as {
      verifier: { required_changes: unknown[] };
    },
  };
};

describe("browser-derived control completion", () => {
  it("verifies both expanding and collapsing native disclosure controls", () => {
    expect(
      fixture({ expanded: false }).definition.verifier.required_changes,
    ).toEqual([{ ref_id: "ref", field: "expanded", expected: true }]);
    expect(
      fixture({ expanded: true }).definition.verifier.required_changes,
    ).toEqual([{ ref_id: "ref", field: "expanded", expected: false }]);
  });
  it("requires menu continuation only for approved navigation sessions", () => {
    expect(
      fixture({ expanded: false }).session.awaitingExpandedMenuSelection,
    ).toBeUndefined();
    expect(
      fixture({ expanded: false }, "button", "session").session
        .awaitingExpandedMenuSelection,
    ).toBe(true);
  });
  it("verifies tab selection and keeps unknown clicks without a completion", () => {
    expect(
      fixture({ selected: false }, "tab").definition.verifier.required_changes,
    ).toEqual([{ ref_id: "ref", field: "selected", expected: true }]);
    expect(fixture({}).definition.verifier.required_changes).toEqual([]);
  });
});
