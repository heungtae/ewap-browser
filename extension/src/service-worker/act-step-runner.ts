import { traceDecision } from "../diagnostics/method-trace.js";
import { nextWorkflowStep } from "../contracts/workflow.js";
import { fail, ContractError } from "../security/validation.js";
import { genericActTools } from "./act-tools.js";
import { actionReview, actionView } from "./act-review-presentation.js";
import {
  parseActProposal,
  parsePageApiProposal,
} from "./act-proposal-parser.js";
import { workflowActionDefinitions } from "./act-workflow-authority.js";
import { findUnjustifiedDrops } from "../page-act-harness/act-entry-bridge.js";
import { selectActActionTools } from "./page-derived-actions.js";
import { safeChatText } from "../state/tab-chat-session-store.js";
import type { ActProposal, ActSession } from "./act-session-types.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import { failActRun } from "./act-run-failure.js";
import { actStepMessages } from "./act-step-messages.js";
import { assertRequestActive } from "./request-context.js";
import { pageApiRegistry } from "../page-api/registry.js";
import type { PageApiActionRef } from "../contracts/page-api-types.js";
import { opaqueId } from "../security/canonical.js";
import { analysisDataForScope } from "./analysis-data-scope.js";
export const createActStepRunner = (dependencies: ActStepDependencies) => {
  const runStep = async (
    session: ActSession,
  ): Promise<Record<string, unknown>> => {
    const context =
      session.requestContext ?? dependencies.requestContext?.(session.tabId);
    if (context) session.requestContext = context;
    assertRequestActive(session.requestContext);
    const active = await dependencies.readActive(undefined, session.tabId);
    assertRequestActive(session.requestContext);
    if (
      session.requestContext?.documentEpoch &&
      active.snapshot.document_epoch !== session.requestContext.documentEpoch
    )
      return fail("PAGE_SCOPE_STALE");
    if (active.tabId !== session.tabId || active.origin !== session.origin)
      return fail("PROFILE_UNAVAILABLE");
    const run = dependencies.coordinator.runs.start(
      active.tabId,
      active.snapshot.frame_id,
      active.snapshot.document_epoch,
      "act",
    );
    session.runId = run.id;
    try {
      dependencies.bindRun(
        run.id,
        active.tabId,
        dependencies.pageScope(active),
      );
      if (!session.userMessagePublished) {
        dependencies.publish(run.id, {
          type: "user_message",
          text: safeChatText(session.prompt),
        });
        session.userMessagePublished = true;
      }
      dependencies.publish(run.id, {
        type: "run_started",
        mode: "act",
        permission_mode: dependencies.preferences().permission_mode,
      });
      dependencies.publish(run.id, {
        type: "activity_started",
        stage: "PREPARING_PAGE",
      });
      let targetRefId: string | undefined;
      if (session.workflow) {
        const candidate = workflowActionDefinitions(
          active.snapshot,
          session.workflow.step,
          session.profileDefinitions,
        );
        if (!candidate) return fail("WORKFLOW_STATE_MISMATCH");
        session.definitions = candidate.definitions;
        session.discovery = candidate.discovery;
        targetRefId = candidate.targetRefId;
      } else {
        const selected = selectActActionTools(
          active.snapshot,
          session.profileDefinitions,
        );
        session.definitions = selected.definitions;
        session.discovery = selected.discovery;
      }
      const model = dependencies.coordinator.modelSnapshot(
        run.id,
        active.snapshot,
      );
      const projection = `[UNTRUSTED_PAGE_PROJECTION]\n${dependencies.serialise(model.snapshot)}\n[/UNTRUSTED_PAGE_PROJECTION]`;
      const profileContext = session.modelContext
        ? `[UNTRUSTED_PAGE_PROFILE_CONTEXT]\n${dependencies.serialise(session.modelContext)}\n[/UNTRUSTED_PAGE_PROFILE_CONTEXT]`
        : undefined;
      if (session.analysisData)
        session.analysisData = analysisDataForScope(
          session.analysisData,
          session.analysisScope,
          dependencies.pageScope(active),
        );
      const analysisContext = session.analysisData
        ? `[UNTRUSTED_ANALYSIS_DATA]\n${dependencies.serialise(session.analysisData)}\n[/UNTRUSTED_ANALYSIS_DATA]`
        : undefined;
      const messages = actStepMessages({
        session,
        profileContext,
        projection,
        threadContext: dependencies.threadContext(active.tabId),
        ...(analysisContext ? { analysisContext } : {}),
      });
      if (!session.pageApiActions) {
        const adapter = pageApiRegistry.find(active.origin, active.path);
        session.pageApiScope = dependencies.pageScope(active);
        session.pageApiActions = adapter
          ? adapter.actions.map(
              (action): PageApiActionRef => ({
                action_ref: opaqueId(),
                adapter_id: adapter.adapter_id,
                adapter_version: adapter.version,
                action_id: action.action_id,
                option_ids: action.option_ids,
                option_labels: action.option_labels,
                label: action.label,
                description: action.description,
                completion: action.completion,
              }),
            )
          : [];
      }
      const tools = genericActTools(
        session.definitions,
        model.snapshot,
        active.snapshot,
        targetRefId ? new Set([targetRefId]) : undefined,
        session.pageApiActions,
      );
      if (session.harnessCapabilities) {
        // No silent narrowing: a declared entry tool dropped while its
        // targets are still visible fails loudly on the generic path. A
        // workflow step intentionally scopes tools (PAH-5 re-review owns that
        // path), and a stale declaration (request moved on) is skipped.
        const declaredRevision = session.harnessCapabilities.request_revision;
        const currentRevision = session.requestContext?.generation ?? 1;
        if (declaredRevision !== currentRevision) {
          traceDecision("page-act-harness.entry.declaration_stale", {
            declared_revision: declaredRevision,
            current_revision: currentRevision,
          });
        } else {
          // Fail only on the intersection: targets present at entry AND in
          // the fresh snapshot, yet the tool is gone. Targets lost to a
          // page change never fail here (stale machinery owns that case).
          const entryNodes = session.harnessCapabilities.entry_roles.map(
            (role) => ({ role, visible: true, enabled: true }),
          );
          const entryDrops = findUnjustifiedDrops(
            session.harnessCapabilities.propose_tools,
            tools.map((tool) => ({ name: tool.function.name })),
            entryNodes,
          );
          const freshDrops = findUnjustifiedDrops(
            session.harnessCapabilities.propose_tools,
            tools.map((tool) => ({ name: tool.function.name })),
            active.snapshot.nodes,
          );
          const unjustified = entryDrops.filter((name) =>
            freshDrops.includes(name),
          );
          if (unjustified.length > 0 && !session.workflow)
            return fail("HARNESS_TOOL_NARROWING");
          if (unjustified.length > 0)
            traceDecision("page-act-harness.entry.workflow_scoped", {
              unjustified,
            });
        }
      }
      dependencies.publish(run.id, {
        type: "activity_progress",
        stage: "CONTACTING_PROVIDER",
      });
      const response = await dependencies.provider.chat(
        {
          messages,
          ...(tools.length > 0 ? { tools } : {}),
        },
        session.requestContext
          ? {
              signal: session.requestContext.signal,
              onProgress: () =>
                session.requestContext?.progress?.("PROVIDER_BODY"),
            }
          : {},
      );
      assertRequestActive(session.requestContext);
      if (session.analysisData) {
        const current = await dependencies
          .readActive(undefined, session.tabId)
          .catch(() => undefined);
        assertRequestActive(session.requestContext);
        if (
          !current ||
          current.tabId !== session.tabId ||
          analysisDataForScope(
            session.analysisData,
            session.analysisScope,
            dependencies.pageScope(current),
          ).reason === "PAGE_CHANGED"
        )
          throw new ContractError("PAGE_SCOPE_STALE");
      }
      if (run.phase === "TERMINAL") return fail("POLICY_DENIED");
      traceDecision("act.provider.response", {
        request_id: session.requestContext?.requestId,
        tab_id: session.tabId,
        tool_count: response.tool_calls.length,
        offered_tool_count: tools.length,
        offered_tools: tools.map((tool) => tool.function.name),
        response_text: response.content,
        result_kind:
          response.tool_calls.length === 0
            ? "ANSWER_ONLY_NO_PAGE_ACTION"
            : "ACTION_PROPOSAL",
        verification_meaning:
          response.tool_calls.length === 0
            ? "ANSWER_COMPLETED_NOT_PAGE_MUTATION_VERIFIED"
            : "APPROVAL_AND_DISPATCH_REQUIRED",
      });
      if (response.tool_calls.length === 0) {
        if (!response.content) return fail("PROVIDER_UNAVAILABLE");
        if (session.awaitingExpandedMenuSelection)
          return fail("TARGET_NOT_ACTIONABLE");
        dependencies.coordinator.runs.terminal(run.id, "VERIFIED");
        dependencies.publish(run.id, {
          type: "assistant_delta",
          text: response.content,
        });
        dependencies.publish(run.id, {
          type: "activity_finished",
          stage: "COMPLETED",
        });
        dependencies.publish(run.id, {
          type: "run_terminal",
          outcome: "VERIFIED",
        });
        dependencies.endSession(session);
        return { ok: true, state: "ANSWER", message: response.content };
      }
      if (response.tool_calls.length !== 1) return fail("INVALID_ARGUMENT");
      const call = response.tool_calls[0];
      if (!call) return fail("INVALID_ARGUMENT");
      const proposal =
        call.name === "propose_page_api"
          ? parsePageApiProposal(call, session.pageApiActions, active.origin)
          : parseActProposal(
              call,
              model.resolve,
              active.snapshot,
              session.definitions,
              session.discovery,
              targetRefId,
            );
      if (session.awaitingExpandedMenuSelection) {
        const target =
          "refId" in proposal
            ? active.snapshot.nodes.find(
                (node) => node.ref_id === proposal.refId,
              )
            : undefined;
        if (!target || !["menuitem", "option"].includes(target.role))
          return fail("TARGET_NOT_ACTIONABLE");
        delete session.awaitingExpandedMenuSelection;
      }
      dependencies.coordinator.runs.transition(run.id, "PROPOSING");
      session.messages.push({
        role: "assistant",
        content: response.content,
        tool_calls: response.tool_calls,
      });
      session.proposal = proposal;
      if (session.continueAfterApproval) {
        if ((session.autoExecutionCount ?? 0) >= 12)
          return fail("WORKFLOW_STEP_LIMIT");
        session.autoExecutionCount = (session.autoExecutionCount ?? 0) + 1;
        return dependencies.executeApprovedProposal(session);
      }
      if (response.content)
        dependencies.publish(run.id, {
          type: "assistant_delta",
          text: response.content,
        });
      dependencies.publish(run.id, {
        type: "action_review_required",
        action: actionView(session, proposal),
      });
      dependencies.publish(run.id, {
        type: "activity_finished",
        stage: "AWAITING_REVIEW",
      });
      return actionReview(session, proposal);
    } catch (error) {
      failActRun({ ...dependencies, session, run, error });
      throw error;
    }
  };

  const continueWorkflow = async (
    session: ActSession,
    proposal: ActProposal,
  ): Promise<Record<string, unknown>> => {
    if (proposal.tool === "call_page_api")
      return fail("WORKFLOW_STATE_MISMATCH");
    const workflow = session.workflow;
    if (!workflow) return runStep(session);
    if (workflow.count >= 11) return fail("WORKFLOW_STEP_LIMIT");
    assertRequestActive(session.requestContext);
    const active = await dependencies.readActive(undefined, session.tabId);
    assertRequestActive(session.requestContext);
    if (active.tabId !== session.tabId || active.origin !== session.origin)
      return fail("WORKFLOW_STATE_MISMATCH");
    const next = nextWorkflowStep(
      workflow.declaration,
      workflow.step,
      proposal.value,
      active.snapshot,
    );
    if (!next) {
      if (workflow.step.branches?.length && !workflow.step.next)
        return fail("WORKFLOW_STATE_MISMATCH");
      dependencies.endSession(session);
      return { ok: true, outcome: "VERIFIED", workflow_complete: true };
    }
    session.workflow = {
      declaration: workflow.declaration,
      step: next,
      count: workflow.count + 1,
    };
    return runStep(session);
  };
  return { continueWorkflow, runStep };
};
