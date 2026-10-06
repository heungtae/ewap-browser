import type {
  ProviderToolCall,
  ProviderToolDefinition,
} from "../providers/types.js";
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
import {
  findUnjustifiedDrops,
  toHarnessRevision,
} from "../page-act-harness/act-entry-bridge.js";
import {
  actHarnessReadTools,
  createActHarnessReadExecutor,
  harnessFirstPayloadBlock,
  runHarnessReadTurns,
  runWorkflowReviewGate,
} from "./act-harness-turns.js";
import { classifyOutcome } from "../page-act-harness/outcome.js";
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
      // Harness read support is request-bound: the first payload carries the
      // harness context block and callable read tools only when an executor
      // is actually wired. Otherwise the propose-only path applies. The
      // declared capability list wins: drift can only ever offer FEWER reads.
      const harnessReads =
        dependencies.readAssist && session.harnessCapabilities
          ? actHarnessReadTools().filter((tool) =>
              session.harnessCapabilities?.read_tools.includes(
                tool.function.name,
              ),
            )
          : [];
      const messages = actStepMessages({
        session,
        profileContext,
        projection,
        threadContext: dependencies.threadContext(active.tabId),
        ...(analysisContext ? { analysisContext } : {}),
        ...(harnessReads.length > 0 && session.harnessCapabilities
          ? {
              harnessBlock: harnessFirstPayloadBlock({
                requestRevision: session.harnessCapabilities.request_revision,
                documentEpoch: active.snapshot.document_epoch,
                coverageNote: "visible_only_synopsis; use read tools for more",
                readTools: harnessReads.map((tool) => tool.function.name),
              }),
            }
          : {}),
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
      // Shared harness read executor (text reads only; no vision/business).
      // Built once per turn when read support is wired; absent otherwise.
      const harnessExecutor =
        harnessReads.length > 0 && dependencies.readAssist
          ? createActHarnessReadExecutor({
              snapshot: model.snapshot,
              tabId: active.tabId,
              runId: run.id,
              ...(session.requestContext?.signal
                ? { signal: session.requestContext.signal }
                : {}),
              assist: dependencies.readAssist,
            })
          : undefined;
      // Workflow suitability review gate: a session started from a user
      // selection reviews fit (original request + current page + candidate
      // facts, with reads) BEFORE any step tool is offered. mismatch and
      // needs_context end in a user clarification with zero mutations.
      if (
        session.workflow &&
        session.harnessReview?.status === "PENDING_REVIEW"
      ) {
        // Raw product generations convert exactly once here; an already
        // stored harness revision passes through untouched (the mapping is
        // not idempotent, so stored values are never re-normalized).
        const expectedRevision = session.requestContext
          ? toHarnessRevision(session.requestContext.generation)
          : session.harnessReview.request_revision;
        const gate = await runWorkflowReviewGate({
          chat: (gateMessages, gateTools) =>
            dependencies.provider.chat(
              {
                messages: gateMessages,
                ...(gateTools.length > 0 ? { tools: gateTools } : {}),
              },
              session.requestContext
                ? {
                    signal: session.requestContext.signal,
                    onProgress: () =>
                      session.requestContext?.progress?.("PROVIDER_BODY"),
                  }
                : {},
            ),
          session,
          projection,
          serialise: dependencies.serialise,
          readTools: harnessReads,
          executeRead: harnessExecutor
            ? (call) => harnessExecutor(call)
            : async (): Promise<unknown> => {
                throw fail("INVALID_ARGUMENT");
              },
          expectedRevision,
          runId: run.id,
          publishDelta: (text) =>
            dependencies.publish(run.id, {
              type: "assistant_delta",
              text,
            }),
          isCancelled: () =>
            dependencies.coordinator.runs.byId(run.id)?.phase === "TERMINAL",
          refreshBinding: async () => {
            const current = await dependencies
              .readActive(undefined, session.tabId)
              .catch(() => undefined);
            assertRequestActive(session.requestContext);
            return (
              current !== undefined &&
              current.snapshot.document_epoch ===
                active.snapshot.document_epoch &&
              current.origin === active.origin
            );
          },
        });
        if (!gate.proceed) {
          dependencies.coordinator.runs.terminal(run.id, "VERIFIED");
          dependencies.publish(run.id, {
            type: "assistant_delta",
            text: gate.message,
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
          return { ok: true, state: "CLARIFICATION", message: gate.message };
        }
      }
      if (session.harnessCapabilities) {
        // No silent narrowing: a declared entry tool dropped while its
        // targets are still visible fails loudly on the generic path. A
        // workflow step intentionally scopes tools (the review gate owns that
        // path), and a stale declaration (request moved on) is skipped.
        // The stored declaration revision is compared directly; only the
        // live product generation converts (stored values are never
        // re-normalized — the mapping is not idempotent).
        const declaredRevision = session.harnessCapabilities.request_revision;
        const currentRevision = session.requestContext
          ? toHarnessRevision(session.requestContext.generation)
          : declaredRevision;
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
      const chatOnce = (offered: ProviderToolDefinition[]) =>
        dependencies.provider.chat(
          {
            messages,
            ...(offered.length > 0 ? { tools: offered } : {}),
          },
          session.requestContext
            ? {
                signal: session.requestContext.signal,
                onProgress: () =>
                  session.requestContext?.progress?.("PROVIDER_BODY"),
              }
            : {},
        );
      let response: { content: string; tool_calls: ProviderToolCall[] };
      if (harnessReads.length === 0 || !harnessExecutor) {
        response = await chatOnce(tools);
      } else {
        // Request-bound read loop: the first payload already carries the
        // harness context block plus callable read tools; read results
        // return into the same request/binding before any proposal.
        const loop = await runHarnessReadTurns({
          // Shared message-array reference: the loop appends assistant and
          // tool messages in place so the follow-up proposal turn sees the
          // grounded transcript.
          chat: (_loopMessages, loopTools) => chatOnce(loopTools),
          messages,
          offeredTools: [...harnessReads, ...tools],
          readNames: harnessReads.map((tool) => tool.function.name),
          executeRead: (call) => harnessExecutor(call),
          serialise: dependencies.serialise,
          expectedRevision: session.requestContext
            ? toHarnessRevision(session.requestContext.generation)
            : (session.harnessCapabilities?.request_revision ?? 1),
          maxRounds: 3,
          isCancelled: () =>
            dependencies.coordinator.runs.byId(run.id)?.phase === "TERMINAL",
        });
        if (loop.exhausted && loop.calls.length === 0) {
          // Budget exhaustion is INCOMPLETE, never a verified answer: the
          // model kept asking for reads, so the goal is unmet by definition.
          // The user gets the cause plus how to continue; the run terminal
          // records UNKNOWN with the budget code instead of VERIFIED.
          const terminal = classifyOutcome({
            tool_calls_made: loop.reads > 0,
            read_only: false,
            actions: [],
            budget_exhausted: true,
          });
          traceDecision("page-act-harness.read_loop.exhausted_answer", {
            kind: terminal.kind,
            rounds: loop.rounds,
            reads: loop.reads,
          });
          // Budget cause is independent of the last model body: an empty
          // body still means INCOMPLETE/BUDGET_EXHAUSTED, never a provider
          // outage. The provider path throws PROVIDER_UNAVAILABLE on
          // transport failure; this branch is reached only after successful
          // reads were cut off by the budget.
          const budgetNote = `읽기 budget을 소진해 ${loop.reads}회 읽고 중단했습니다(라운드 ${loop.rounds}회). 목표는 아직 확인되지 않았습니다. 더 읽어야 하면 "계속 읽어줘"라고 답하면 같은 페이지에서 이어서 확인합니다.`;
          if (loop.content) {
            dependencies.publish(run.id, {
              type: "assistant_delta",
              text: loop.content,
            });
          }
          dependencies.publish(run.id, {
            type: "assistant_delta",
            text: budgetNote,
          });
          dependencies.coordinator.runs.terminal(
            run.id,
            "UNKNOWN",
            "CONTEXT_BUDGET_EXCEEDED",
          );
          dependencies.publish(run.id, {
            type: "activity_finished",
            stage: "FAILED",
          });
          dependencies.publish(run.id, {
            type: "run_terminal",
            outcome: "UNKNOWN",
            code: "CONTEXT_BUDGET_EXCEEDED",
          });
          dependencies.endSession(session);
          return {
            ok: true,
            state: "INCOMPLETE",
            message: loop.content || budgetNote,
            reason: "BUDGET_EXHAUSTED",
            reads: loop.reads,
            rounds: loop.rounds,
          };
        }
        response = { content: loop.content, tool_calls: loop.calls };
      }
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
        // Non-authoritative harness record: a tool-less answer is never a
        // page mutation. Legacy terminal semantics below are unchanged.
        const terminal = classifyOutcome({
          tool_calls_made: false,
          read_only: true,
          actions: [],
        });
        traceDecision("page-act-harness.outcome.terminal_kind", {
          kind: terminal.kind,
        });
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
