import { describe, expect, it, vi } from "vitest";
import { ServiceCoordinator } from "../../../src/service-worker/coordinator.js";
import { prepareActProposal } from "../../../src/service-worker/act-proposal-readiness.js";
import type { ActSession } from "../../../src/service-worker/act-session-types.js";
import type { ParsedActProposal } from "../../../src/service-worker/act-proposal-parser.js";

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
