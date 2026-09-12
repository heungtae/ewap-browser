import { nextWorkflowStep } from "../contracts/workflow.js";
import { fail } from "../security/validation.js";
import { genericActTools } from "./act-tools.js";
import { actionReview, actionView } from "./act-review-presentation.js";
import {
  parseActProposal,
  workflowDefinitions,
} from "./act-proposal-parser.js";
import { selectActActionTools } from "./page-derived-actions.js";
import { safeChatText } from "../state/tab-chat-session-store.js";
import type { ActProposal, ActSession } from "./act-session-types.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import { failActRun } from "./act-run-failure.js";
import { actStepMessages } from "./act-step-messages.js";
export const createActStepRunner = (dependencies: ActStepDependencies) => {
  const runStep = async (
    session: ActSession,
  ): Promise<Record<string, unknown>> => {
    const active = await dependencies.readActive();
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
        const candidate = workflowDefinitions(
          active.snapshot,
          session.workflow.step,
        );
        if (!candidate) return fail("WORKFLOW_STATE_MISMATCH");
        session.definitions = candidate.definitions;
        session.discovery = "page-derived";
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
      const messages = actStepMessages({
        session,
        profileContext,
        projection,
        threadContext: dependencies.threadContext(active.tabId),
      });
      const tools = genericActTools(
        session.definitions,
        model.snapshot,
        active.snapshot,
        targetRefId ? new Set([targetRefId]) : undefined,
      );
      dependencies.publish(run.id, {
        type: "activity_progress",
        stage: "CONTACTING_PROVIDER",
      });
      const response = await dependencies.provider.chat({
        messages,
        ...(tools.length > 0 ? { tools } : {}),
      });
      if (response.tool_calls.length === 0) {
        if (!response.content) return fail("PROVIDER_UNAVAILABLE");
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
      const proposal = parseActProposal(
        call,
        model.resolve,
        active.snapshot,
        session.definitions,
        session.discovery,
        targetRefId,
      );
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
    const workflow = session.workflow;
    if (!workflow) return runStep(session);
    if (workflow.count >= 11) return fail("WORKFLOW_STEP_LIMIT");
    const active = await dependencies.readActive();
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
