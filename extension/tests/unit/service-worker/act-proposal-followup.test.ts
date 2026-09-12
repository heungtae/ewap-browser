import { describe, expect, it, vi } from "vitest";
import type { ProfileActionTool } from "../../../src/profile/profile.js";
import { ServiceCoordinator } from "../../../src/service-worker/coordinator.js";
import { createActProposalFollowup } from "../../../src/service-worker/act-proposal-followup.js";
import type {
  ActProposal,
  ActSession,
} from "../../../src/service-worker/act-session-types.js";
import type { ActionDefinition } from "../../../src/state/mutation-coordinator.js";

const policy = {
  permission_origins: ["<all_urls>"],
  page_read_origins: ["<all_urls>"],
  profile_resolver_origins: [],
  llm_egress_origins: [],
};
const textDefinition: ProfileActionTool = {
  tool: "set_text_by_ref",
  effect: "local-ui-only",
  risk: "R1",
  eligible_roles: ["textbox"],
  verifier: {
    kind: "semantic-state-transition",
    declaration_id: "text-v1",
    pre_state_digest: "digest",
    required_changes: [],
  },
};
const textMutationDefinition: ActionDefinition = {
  ...textDefinition,
  eligibleRoles: textDefinition.eligible_roles,
};
const checkDefinition: ProfileActionTool = {
  tool: "set_checked_by_ref",
  effect: "server-side",
  risk: "R2",
  eligible_roles: ["checkbox"],
  verifier: {
    kind: "semantic-state-transition",
    declaration_id: "check-v1",
    pre_state_digest: "digest",
    required_changes: [],
  },
};
const checkMutationDefinition: ActionDefinition = {
  ...checkDefinition,
  eligibleRoles: checkDefinition.eligible_roles,
};

describe("Act proposal follow-up", () => {
  it("rechecks_enterprise_policy_before_consuming_a_submitted_value", async () => {
    const coordinator = new ServiceCoordinator(policy);
    coordinator.completeStorageBootstrap(true);
    const run = coordinator.runs.start(1, 0, "epoch-abcdefghijklmnop", "act");
    const awaiting = coordinator.mutations.propose(
      run,
      { tool: "set_text_by_ref", target: "target" },
      {
        refId: "target-abcdefghijklmnop",
        role: "textbox",
        visible: true,
        enabled: true,
        sensitive: false,
        stale: false,
      },
      { id: "profile", version: 1 },
      textMutationDefinition,
    );
    if (awaiting.state !== "AWAITING_VALUE")
      throw new Error("expected value state");
    const proposal: ActProposal = {
      id: "proposal-abcdefghijkl",
      tool: "set_text_by_ref",
      refId: "target-abcdefghijklmnop",
      targetName: "Name",
      approvalScope: "single_step",
      approvalReason: "텍스트 입력은 매 단계 확인이 필요합니다.",
      toolCallId: "tool-call-abcdefghijkl",
      definition: textDefinition,
    };
    const session = {
      id: "session-abcdefghijkl",
      tabId: run.tabId,
      origin: "https://portal.company.test",
      runId: run.id,
      proposal,
      profile: { id: "profile", version: 1 },
      awaitingValue: {
        runId: run.id,
        valueSlotId: awaiting.valueSlotId,
        valueKind: awaiting.valueKind,
      },
    } as unknown as ActSession;
    const authorizeEnterprise = vi.fn(async () => ({
      decision: "DENY" as const,
      managed_auto: false,
    }));
    const followup = createActProposalFollowup({
      coordinator,
      authorizeEnterprise,
      getRun: (runId) => coordinator.runs.byId(runId),
      execute: async () => ({ ok: true }),
      complete: async () => ({ ok: true }),
    });

    await expect(followup.submitValue(session, "new value")).rejects.toThrow(
      "ENTERPRISE_POLICY_DENIED",
    );
    expect(authorizeEnterprise).toHaveBeenCalledWith(
      expect.objectContaining({
        run_id: run.id,
        capability: "type",
        risk: "R1",
      }),
    );
    expect(run.phase).toBe("AWAITING_VALUE");
  });

  it("rechecks_enterprise_policy_before_consuming_confirmation", async () => {
    const coordinator = new ServiceCoordinator(policy);
    coordinator.completeStorageBootstrap(true);
    const run = coordinator.runs.start(1, 0, "epoch-abcdefghijklmnop", "act");
    const awaiting = coordinator.mutations.propose(
      run,
      {
        tool: "set_checked_by_ref",
        target: "target",
        argument: { checked: true },
      },
      {
        refId: "target-abcdefghijklmnop",
        role: "checkbox",
        visible: true,
        enabled: true,
        sensitive: false,
        stale: false,
      },
      { id: "profile", version: 1 },
      checkMutationDefinition,
      "session-abcdefghijkl",
    );
    if (awaiting.state !== "AWAITING_CONFIRMATION")
      throw new Error("expected confirmation state");
    const proposal: ActProposal = {
      id: "proposal-abcdefghijkl",
      tool: "set_checked_by_ref",
      refId: "target-abcdefghijklmnop",
      targetName: "Enabled",
      approvalScope: "single_step",
      approvalReason: "선택 상태 변경은 매 단계 확인이 필요합니다.",
      argument: { checked: true },
      toolCallId: "tool-call-abcdefghijkl",
      definition: checkDefinition,
    };
    const session = {
      id: "session-abcdefghijkl",
      tabId: run.tabId,
      origin: "https://portal.company.test",
      runId: run.id,
      proposal,
      profile: { id: "profile", version: 1 },
      awaitingConfirmation: {
        runId: run.id,
        confirmationId: awaiting.confirmationId,
        confirmationNonce: awaiting.confirmationNonce,
      },
    } as unknown as ActSession;
    const authorizeEnterprise = vi.fn(async () => ({
      decision: "DENY" as const,
      managed_auto: false,
    }));
    const followup = createActProposalFollowup({
      coordinator,
      authorizeEnterprise,
      getRun: (runId) => coordinator.runs.byId(runId),
      execute: async () => ({ ok: true }),
      complete: async () => ({ ok: true }),
    });

    await expect(
      followup.confirmProposal(
        session,
        awaiting.confirmationId,
        awaiting.confirmationNonce,
      ),
    ).rejects.toThrow("ENTERPRISE_POLICY_DENIED");
    expect(authorizeEnterprise).toHaveBeenCalledWith(
      expect.objectContaining({
        run_id: run.id,
        capability: "click",
        risk: "R2",
      }),
    );
    expect(run.phase).toBe("AWAITING_CONFIRMATION");
  });
});
