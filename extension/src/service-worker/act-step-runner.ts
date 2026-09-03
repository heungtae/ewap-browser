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
import type { ProviderMessage } from "../providers/types.js";
import type { ActProposal, ActSession } from "./act-session-types.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
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
    dependencies.bindRun(run.id, active.tabId, dependencies.pageScope(active));
    dependencies.publish(run.id, {
      type: "user_message",
      text: safeChatText(session.prompt),
    });
    dependencies.publish(run.id, {
      type: "run_started",
      mode: "act",
      permission_mode: dependencies.preferences().permission_mode,
    });
    let targetRefId: string | undefined;
    if (session.workflow) {
      const candidate = workflowDefinitions(
        active.snapshot,
        session.workflow.step,
      );
      if (!candidate) {
        dependencies.coordinator.runs.terminal(run.id, "FAILED");
        dependencies.publish(run.id, {
          type: "run_terminal",
          outcome: "FAILED",
          code: "WORKFLOW_STATE_MISMATCH",
        });
        dependencies.endSession(session);
        return fail("WORKFLOW_STATE_MISMATCH");
      }
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
    const messages: ProviderMessage[] = session.workflow
      ? [
          session.messages.at(0)!,
          ...(profileContext
            ? [{ role: "user" as const, content: profileContext }]
            : []),
          {
            role: "user",
            content: `Workflow step ${session.workflow.count + 1}/${session.workflow.declaration.steps.length}. Propose exactly one call to the supplied tool for this fixed current step. For option selection, choose exactly one supplied enum value. Do not repeat a previous tool call or target. User execution request: ${safeChatText(session.prompt)}`,
          },
          { role: "user", content: projection },
        ]
      : [
          session.messages.at(0)!,
          ...(profileContext
            ? [{ role: "user" as const, content: profileContext }]
            : []),
          ...dependencies.threadContext(active.tabId),
          ...session.messages.slice(1),
          { role: "user", content: projection },
        ];
    const tools = genericActTools(
      session.definitions,
      model.snapshot,
      active.snapshot,
      targetRefId ? new Set([targetRefId]) : undefined,
    );
    if (tools.length === 0) {
      dependencies.coordinator.runs.terminal(run.id, "FAILED");
      dependencies.publish(run.id, {
        type: "run_terminal",
        outcome: "FAILED",
        code: "PROFILE_UNAVAILABLE",
      });
      dependencies.endSession(session);
      return fail("PROFILE_UNAVAILABLE");
    }
    await dependencies.write(
      active.tabId,
      "[ContextPilot][LLM request final]",
      {
        step: 1,
        messages: structuredClone(messages),
        tools: structuredClone(tools),
      },
    );
    const response = await dependencies.provider.chat({ messages, tools });
    await dependencies.write(
      active.tabId,
      "[ContextPilot][LLM response final]",
      { step: 1, message: structuredClone(response) },
    );
    if (response.tool_calls.length === 0) {
      if (!response.content) return fail("PROVIDER_UNAVAILABLE");
      dependencies.coordinator.runs.terminal(run.id, "VERIFIED");
      dependencies.publish(run.id, {
        type: "assistant_delta",
        text: response.content,
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
    if (response.content)
      dependencies.publish(run.id, {
        type: "assistant_delta",
        text: response.content,
      });
    dependencies.publish(run.id, {
      type: "action_review_required",
      action: actionView(session, proposal),
    });
    return actionReview(session, proposal);
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
