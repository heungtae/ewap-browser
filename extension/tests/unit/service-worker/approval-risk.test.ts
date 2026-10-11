import { describe, expect, it, vi } from "vitest";
import { defaultAgentPreferences } from "../../../src/policy/permission-mode.js";
import { defaultApprovalPolicy } from "../../../src/policy/approval-policy.js";
import { ServiceCoordinator } from "../../../src/service-worker/coordinator.js";
import { prepareActProposal } from "../../../src/service-worker/act-proposal-readiness.js";
import type { ParsedActProposal } from "../../../src/service-worker/act-proposal-parser.js";
import type { ActSession } from "../../../src/service-worker/act-session-types.js";
describe("S22 supported R2 confirmation", () => {
  it.each(["auto", "deny", "ask"] as const)(
    "applies %s using the existing confirmation store",
    (decision) => {
      const coordinator = new ServiceCoordinator({
        permission_origins: ["<all_urls>"],
        page_read_origins: ["<all_urls>"],
        profile_resolver_origins: [],
        llm_egress_origins: [],
      });
      coordinator.completeStorageBootstrap(true);
      const run = coordinator.runs.start(1, 0, "epoch-abcdefghijklmnop", "act");
      const policy = defaultApprovalPolicy();
      policy.mode = "custom";
      policy.categories.risk_confirmation = decision;
      const preferences = {
        ...defaultAgentPreferences(),
        approval_policy: policy,
      };
      const proposal: ParsedActProposal = {
        id: "proposal-abcdefghijklmnop",
        tool: "click_by_ref",
        refId: "target-abcdefghijklmnop",
        targetName: "Submit",
        approvalScope: "single_step",
        approvalReason: "Submit",
        toolCallId: "call-abcdefghijklmnop",
        definition: {
          tool: "click_by_ref",
          effect: "server-side",
          risk: "R2",
          eligible_roles: ["button"],
          verifier: {
            kind: "semantic-state-transition",
            declaration_id: "submit-v1",
            pre_state_digest: "",
            required_changes: [
              { ref_id: "$target", field: "disabled", expected: true },
            ],
          },
        },
      };
      const session = {
        id: "session-abcdefghijklmnop",
        profile: { id: "signed", version: 1 },
      } as ActSession;
      const publish = vi.fn();
      const confirm = vi.spyOn(coordinator.mutations, "confirm");
      const prepare = () =>
        prepareActProposal(
          {
            coordinator,
            publish,
            preferences: () => preferences,
            actionView: () => ({}) as never,
          },
          session,
          run,
          proposal,
          {
            ref_id: proposal.refId,
            role: "button",
            name: "Submit",
            enabled: true,
            visible: true,
            state: { disabled: false },
          },
        );
      if (decision === "deny") {
        expect(prepare).toThrow("POLICY_DENIED");
        expect(confirm).not.toHaveBeenCalled();
      } else if (decision === "auto") {
        expect(prepare()).toHaveProperty("ready.state", "READY_TO_EXECUTE");
        expect(confirm).toHaveBeenCalledOnce();
        const args = confirm.mock.calls[0]!;
        expect(() => coordinator.mutations.confirm(...args)).toThrow(
          "CONFIRMATION_INVALID",
        );
        expect(publish).not.toHaveBeenCalledWith(
          run.id,
          expect.objectContaining({ type: "confirmation_required" }),
        );
        expect(session.awaitingConfirmation).toBeUndefined();
      } else {
        expect(prepare()).toHaveProperty(
          "response.state",
          "CONFIRMATION_REQUIRED",
        );
        expect(confirm).not.toHaveBeenCalled();
      }
    },
  );
});
