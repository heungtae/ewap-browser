import { describe, expect, it, vi } from "vitest";
import { PermissionManager } from "../../../src/policy/permission-manager.js";
import { defaultAgentPreferences } from "../../../src/policy/permission-mode.js";
import { PlanScopeStore } from "../../../src/policy/plan-scope.js";
import { createActProposalExecutor } from "../../../src/service-worker/act-proposal-executor.js";
import type { ActSession } from "../../../src/service-worker/act-session-types.js";
import { ServiceCoordinator } from "../../../src/service-worker/coordinator.js";
import { ContractError } from "../../../src/security/validation.js";

const origin = "https://portal.company.test";

describe("Act Enterprise/local permission intersection", () => {
  it("keeps_explicit_local_deny_even_if_an_enterprise_decision_requests_auto", async () => {
    const coordinator = new ServiceCoordinator({
      permission_origins: ["<all_urls>"],
      page_read_origins: ["<all_urls>"],
      profile_resolver_origins: [],
      llm_egress_origins: [],
    });
    coordinator.completeStorageBootstrap(true);
    const run = coordinator.runs.start(1, 0, "epoch-abcdefghijklmnop", "act");
    const permissions = new PermissionManager();
    permissions.decide("click", origin, run.id, "deny");
    const requestPermission = vi.fn();
    const readActive = vi.fn();
    const evidence = vi.fn(async () => undefined);
    const publish = vi.fn();
    const executor = createActProposalExecutor({
      coordinator,
      permissions,
      preferences: defaultAgentPreferences,
      authorizeEnterprise: async () => ({
        decision: "ALLOW",
        managed_auto: true,
      }),
      evidence,
      planScopes: new PlanScopeStore(),
      readActive,
      getRun: (id: string) => coordinator.runs.byId(id),
      requestPermission,
      publish,
    } as unknown as Parameters<typeof createActProposalExecutor>[0]);
    const session = {
      id: "session-abcdefghijkl",
      tabId: 1,
      origin,
      runId: run.id,
      profile: { id: "profile", version: 1 },
      workflow: { declaration: { id: "private workflow title" } },
      proposal: {
        id: "proposal-abcdefghijkl",
        tool: "click_by_ref",
        refId: "target-abcdefghijklmnop",
        targetName: "Save",
        approvalScope: "single_step",
        approvalReason: "Save",
        toolCallId: "tool-call-abcdefghijkl",
        definition: { risk: "R2" },
      },
    } as ActSession;

    await expect(executor.executeProposal(session)).rejects.toThrow(
      "POLICY_DENIED",
    );
    expect(requestPermission).not.toHaveBeenCalled();
    expect(readActive).not.toHaveBeenCalled();
    expect(evidence).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "policy",
        run_id: run.id,
        decision: "ALLOW",
        stage: "authorized",
      }),
    );
    expect(JSON.stringify(evidence.mock.calls)).not.toContain(
      "private workflow title",
    );
    expect(JSON.stringify(evidence.mock.calls)).not.toContain('"profile"');

    const denying = createActProposalExecutor({
      coordinator,
      permissions,
      preferences: defaultAgentPreferences,
      authorizeEnterprise: async () => {
        throw new ContractError("ENTERPRISE_POLICY_DENIED");
      },
      evidence,
      planScopes: new PlanScopeStore(),
      readActive,
      getRun: (id: string) => coordinator.runs.byId(id),
      requestPermission,
      publish,
    } as unknown as Parameters<typeof createActProposalExecutor>[0]);
    await expect(denying.executeProposal(session)).rejects.toThrow(
      "ENTERPRISE_POLICY_DENIED",
    );
    expect(evidence).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "policy",
        run_id: run.id,
        decision: "DENY",
        code: "ENTERPRISE_POLICY_DENIED",
        stage: "requested",
      }),
    );
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
