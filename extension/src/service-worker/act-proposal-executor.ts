import { fail } from "../security/validation.js";
import {
  gatePermission,
  type AgentPreferences,
} from "../policy/permission-mode.js";
import type {
  PermissionManager,
  Capability,
} from "../policy/permission-manager.js";
import type { PlanScopeStore } from "../policy/plan-scope.js";
import type { ReadyExecution } from "../state/mutation-coordinator.js";
import type { Run } from "../state/run-coordinator.js";
import type { ServiceCoordinator } from "./coordinator.js";
import type {
  ChatActionView,
  ChatEventPayload,
} from "../contracts/chat-events.js";
import type { ActivePage } from "./page-context-runtime.js";
import type { ActProposal, ActSession } from "./act-session-types.js";
import { completeActProposal } from "./act-proposal-completion.js";
import { createActProposalFollowup } from "./act-proposal-followup.js";
import { prepareActProposal } from "./act-proposal-readiness.js";

type Execution = Record<string, unknown>;
type Outcome = "FAILED" | "UNKNOWN" | "VERIFIED";

type Dependencies = {
  coordinator: ServiceCoordinator;
  permissions: PermissionManager;
  preferences(): AgentPreferences;
  planScopes: PlanScopeStore;
  readActive(): Promise<ActivePage>;
  getRun(runId: string): Run | undefined;
  requestPermission(
    capability: Capability,
    origin: string,
    sessionId: string,
  ): string;
  execute(run: Run, ready: ReadyExecution, origin: string): Promise<Execution>;
  publish(runId: string, event: ChatEventPayload): void;
  publishTerminal(run: Run, outcome: Outcome, code?: string): void;
  actionView(session: ActSession, proposal: ActProposal): ChatActionView;
  continueWorkflow(
    session: ActSession,
    proposal: ActProposal,
  ): Promise<Record<string, unknown>>;
  endSession(session: ActSession): void;
};

const capabilityFor = (proposal: ActProposal): Capability =>
  proposal.tool === "navigate"
    ? "navigate"
    : proposal.tool === "set_checked_by_ref" ||
        proposal.tool === "click_by_ref" ||
        proposal.tool === "press_key_by_ref"
      ? "click"
      : "type";

export const createActProposalExecutor = (dependencies: Dependencies) => {
  const executeProposal = async (
    session: ActSession,
  ): Promise<Record<string, unknown>> => {
    const proposal = session.proposal;
    const run = session.runId ? dependencies.getRun(session.runId) : undefined;
    if (!proposal || !run || run.phase === "TERMINAL")
      return fail("INVALID_ARGUMENT");
    const capability = capabilityFor(proposal);
    dependencies.publish(run.id, {
      type: "tool_started",
      tool_use_id: proposal.toolCallId,
      tool: proposal.tool,
      summary: `${proposal.targetName} 작업을 준비하는 중입니다.`,
    });
    const permission = gatePermission(
      dependencies.permissions,
      dependencies.preferences(),
      capability,
      session.origin,
      session.id,
      dependencies.planScopes.origins(session.id),
    );
    if (permission !== "ALLOW") {
      if (permission === "DENY" || permission === "PLAN_SCOPE_VIOLATION")
        return fail("POLICY_DENIED");
      const requestId = dependencies.requestPermission(
        capability,
        session.origin,
        session.id,
      );
      dependencies.publish(run.id, {
        type: "permission_required",
        request_id: requestId,
        action: dependencies.actionView(session, proposal),
        capability,
        host: new URL(session.origin).hostname,
      });
      return {
        ok: true,
        state: "PERMISSION_REQUIRED",
        permission_request_id: requestId,
        capability,
        host: new URL(session.origin).hostname,
      };
    }
    const active = await dependencies.readActive();
    if (
      active.tabId !== session.tabId ||
      active.origin !== session.origin ||
      active.snapshot.document_epoch !== run.documentEpoch
    )
      return fail("TARGET_STALE");
    const target = active.snapshot.nodes.find(
      (node) => node.ref_id === proposal.refId,
    );
    if (!target || !target.enabled) return fail("TARGET_STALE");
    const prepared = prepareActProposal(
      dependencies,
      session,
      run,
      proposal,
      target,
    );
    if ("response" in prepared) return prepared.response;
    const ready: ReadyExecution = prepared.ready;
    return completeActProposal(
      dependencies,
      session,
      run,
      proposal,
      await dependencies.execute(run, ready, session.origin),
      {
        success: "작업 결과를 확인했습니다.",
        failure: "작업을 완료하지 못했습니다.",
        unknown: "페이지 전환 뒤 결과를 확정하지 못했습니다.",
      },
    );
  };

  const followup = createActProposalFollowup({
    coordinator: dependencies.coordinator,
    getRun: dependencies.getRun,
    execute: dependencies.execute,
    complete: (session, run, proposal, executed, summaries) =>
      completeActProposal(
        dependencies,
        session,
        run,
        proposal,
        executed,
        summaries,
      ),
  });
  return { executeProposal, ...followup };
};
