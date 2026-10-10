import { actValueSource } from "./act-value-source.js";
import { completeActProviderTurn } from "./act-provider-turn.js";
import { actExecutionInventory } from "./act-execution-inventory.js";
import { runPlanSubmissionTurns } from "./act-plan-turns.js";
import { unavailableActFeedback } from "./act-feedback-unavailable.js";
import { submitPlanTool, goalCheckTool } from "./act-plan-schema.js";
import { assertApprovedPlan } from "./act-plan-store.js";
import { finishGoalFeedback } from "./act-goal-feedback.js";
import { requestSourceConsent } from "./source-consent.js";
import type {
  ProviderMessage,
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
  createActHarnessReadExecutor,
  harnessFirstPayloadBlock,
  runHarnessReadTurns,
  runWorkflowReviewGate,
} from "./act-harness-turns.js";
import { classifyOutcome } from "../page-act-harness/outcome.js";
import { selectActActionTools } from "./page-derived-actions.js";
import { safeChatText } from "../state/tab-chat-session-store.js";
import {
  parseClarificationCall,
  storeClarification,
} from "./act-clarification.js";
import type { ActProposal, ActSession } from "./act-session-types.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import { failActRun } from "./act-run-failure.js";
import { actStepMessages } from "./act-step-messages.js";
import { assertRequestActive } from "./request-context.js";
import { pageApiRegistry } from "../page-api/registry.js";
import type { PageApiActionRef } from "../contracts/page-api-types.js";
import { digestCanonical, opaqueId } from "../security/canonical.js";
import { analysisDataForScope } from "./analysis-data-scope.js";
export const createActStepRunner = (dependencies: ActStepDependencies) => {
  const runStep = async (
    session: ActSession,
    clarificationRunId?: string,
  ): Promise<Record<string, unknown>> => {
    const context =
      session.requestContext ?? dependencies.requestContext?.(session.tabId);
    if (context) session.requestContext = context;
    assertRequestActive(session.requestContext);
    const active = await dependencies
      .readActive(undefined, session.tabId)
      .catch((error) => {
        if (session.executionEvidence?.length) return undefined;
        throw error;
      });
    if (!active) return unavailableActFeedback(dependencies, session);
    assertRequestActive(session.requestContext);
    if (session.navigationFeedback) {
      // Only a verified same-origin transition can rebind. No old approval,
      // source cursor, action reference or workflow target survives it.
      if (active.tabId !== session.tabId || active.origin !== session.origin)
        return unavailableActFeedback(dependencies, session);
      delete session.navigationFeedback;
      delete session.plan;
      delete session.pageApiActions;
      delete session.pageApiScope;
      delete session.continueAfterApproval;
      delete session.awaitingExpandedMenuSelection;
      if (session.workflow) session.workflowCompleted = true;
      if (session.requestContext?.documentEpoch)
        session.requestContext = {
          ...session.requestContext,
          documentEpoch: active.snapshot.document_epoch,
        };
    }
    if (
      session.requestContext?.documentEpoch &&
      active.snapshot.document_epoch !== session.requestContext.documentEpoch
    )
      return fail("PAGE_SCOPE_STALE");
    if (active.tabId !== session.tabId || active.origin !== session.origin)
      return fail("PROFILE_UNAVAILABLE");
    const previous = clarificationRunId
      ? dependencies.coordinator.runs.byId(clarificationRunId)
      : undefined;
    if (
      clarificationRunId &&
      (!previous ||
        previous.id !== session.runId ||
        previous.phase !== "AWAITING_VALUE" ||
        previous.tabId !== active.tabId ||
        previous.documentEpoch !== active.snapshot.document_epoch)
    )
      return fail("VALUE_BINDING_INVALID");
    // A clarification is the same pending step. Starting another run would
    // cancel its value binding and hide its events behind the Panel run gate.
    const run = previous
      ? dependencies.coordinator.runs.transition(previous.id, "READING")
      : dependencies.coordinator.runs.start(
          active.tabId,
          active.snapshot.frame_id,
          active.snapshot.document_epoch,
          "act",
        );
    session.runId = run.id;
    try {
      session.lastObservationScope = dependencies.pageScope(active);
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
      if (session.workflow && !session.workflowCompleted) {
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
      const harnessExecutor = dependencies.readAssist
        ? createActHarnessReadExecutor({
            snapshot: model.snapshot,
            tabId: active.tabId,
            runId: run.id,
            ...(session.requestContext?.signal
              ? { signal: session.requestContext.signal }
              : {}),
            assist: dependencies.readAssist,
            ...(dependencies.workflowCandidates
              ? {
                  workflows: {
                    requestRevision: session.requestContext
                      ? toHarnessRevision(session.requestContext.generation)
                      : (session.harnessCapabilities?.request_revision ?? 1),
                    ...(session.requestContext?.signal
                      ? { signal: session.requestContext.signal }
                      : {}),
                    current: () =>
                      !session.requestContext?.signal.aborted &&
                      dependencies.coordinator.runs.byId(run.id)?.phase !==
                        "TERMINAL",
                    load: async () => {
                      assertRequestActive(session.requestContext);
                      const latest = await dependencies.readActive(
                        undefined,
                        session.tabId,
                      );
                      assertRequestActive(session.requestContext);
                      if (
                        latest.tabId !== active.tabId ||
                        latest.origin !== active.origin ||
                        latest.path !== active.path ||
                        latest.snapshot.document_epoch !==
                          active.snapshot.document_epoch
                      )
                        throw Error("STALE");
                      return dependencies.workflowCandidates!(latest, session);
                    },
                  },
                }
              : {}),
            resources: {
              origin: active.origin,
              documentEpoch: active.snapshot.document_epoch,
              requestRevision: session.requestContext
                ? toHarnessRevision(session.requestContext.generation)
                : (session.harnessCapabilities?.request_revision ?? 1),
              current: () =>
                Boolean(dependencies.coordinator.runs.byId(run.id)) &&
                dependencies.coordinator.runs.byId(run.id)?.phase !==
                  "TERMINAL" &&
                session.runId === run.id,
              consent: async (resources) => {
                dependencies.publish(run.id, {
                  type: "activity_progress",
                  stage: "AWAITING_REVIEW",
                });
                const allowed = await requestSourceConsent({
                  runId: run.id,
                  ...(session.requestContext?.signal
                    ? { signal: session.requestContext.signal }
                    : {}),
                  current: () =>
                    Boolean(dependencies.coordinator.runs.byId(run.id)) &&
                    dependencies.coordinator.runs.byId(run.id)?.phase !==
                      "TERMINAL" &&
                    session.runId === run.id,
                  publish: (requestId) =>
                    dependencies.publish(run.id, {
                      type: "source_consent_required",
                      request_id: requestId,
                      resource_count: resources.length,
                      purpose:
                        resources[0] === "component-scroll"
                          ? "component-scroll"
                          : resources[0] === "component-vision"
                            ? "component-vision"
                            : "source",
                      host: new URL(active.origin).host,
                    }),
                });
                if (
                  dependencies.coordinator.runs.byId(run.id)?.phase !==
                  "TERMINAL"
                )
                  dependencies.publish(run.id, {
                    type: "activity_progress",
                    stage: "CONTACTING_PROVIDER",
                  });
                return allowed;
              },
            },
          })
        : undefined;
      const harnessReads =
        harnessExecutor?.tools.filter(
          (tool) =>
            !session.harnessCapabilities ||
            session.harnessCapabilities.read_tools.includes(tool.function.name),
        ) ?? [];
      const resourceInventory = await harnessExecutor
        ?.bootstrap?.()
        .catch(() => ({ status: "UNSUPPORTED" }));
      const messages = actStepMessages({
        session,
        profileContext,
        projection,
        threadContext: dependencies.threadContext(active.tabId),
        ...(analysisContext ? { analysisContext } : {}),
        ...(harnessReads.length > 0
          ? {
              harnessBlock: harnessFirstPayloadBlock({
                requestRevision: session.requestContext
                  ? toHarnessRevision(session.requestContext.generation)
                  : (session.harnessCapabilities?.request_revision ?? 1),
                documentEpoch: active.snapshot.document_epoch,
                coverageNote: "visible_only_synopsis; use read tools for more",
                readTools: harnessReads.map((tool) => tool.function.name),
              }),
            }
          : {}),
      });
      if (resourceInventory)
        messages.push({
          role: "user",
          content: `[UNTRUSTED_PAGE_RESOURCES]\n${dependencies.serialise(resourceInventory)}\n[/UNTRUSTED_PAGE_RESOURCES]`,
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
      const tools =
        session.sourceReadOnly || session.feedbackOnly
          ? []
          : genericActTools(
              session.definitions,
              model.snapshot,
              active.snapshot,
              targetRefId ? new Set([targetRefId]) : undefined,
              session.pageApiActions,
            );
      const observationId = opaqueId();
      const observationDigest = digestCanonical(active.snapshot);
      const requestRevision = session.requestContext
        ? toHarnessRevision(session.requestContext.generation)
        : (session.harnessCapabilities?.request_revision ?? 1);
      const valueSource =
        session.harnessCapabilities && session.prompt.length > 256
          ? actValueSource(session.prompt, requestRevision)
          : undefined;
      if (valueSource) {
        messages.push({ role: "user", content: valueSource.context });
        tools.splice(0, tools.length, ...valueSource.tools(tools));
      }
      const actionTools = [...tools];
      if (!session.sourceReadOnly) {
        messages.push({
          role: "user",
          content: `[UNTRUSTED_EXECUTION_INVENTORY]\n${dependencies.serialise(actExecutionInventory({ session, observationId, requestRevision, documentEpoch: active.snapshot.document_epoch, actionTools, readTools: harnessReads }))}\n[/UNTRUSTED_EXECUTION_INVENTORY]`,
        });
        if (!session.feedbackOnly)
          tools.push(
            submitPlanTool(
              actionTools
                .filter(
                  (tool) => tool.function.name !== "request_clarification",
                )
                .map((tool) => tool.function.name),
              requestRevision,
              [observationId],
            ),
          );
        if (session.executionEvidence?.length)
          tools.push(goalCheckTool(observationId));
      }
      // Workflow suitability review gate: a session started from a user
      // selection reviews fit (original request + current page + candidate
      // facts, with reads) BEFORE any step tool is offered. mismatch and
      // needs_context end in a user clarification with zero mutations.
      if (
        session.workflow &&
        !session.workflowCompleted &&
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
          ...(harnessExecutor?.reviewReady
            ? {
                requireOriginalRead: () =>
                  harnessExecutor.reviewReady!(
                    session.workflow!.declaration,
                    session.harnessReview?.candidate_id,
                  ),
                maxRounds: 12,
              }
            : {}),
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
              current.origin === active.origin &&
              current.tabId === active.tabId &&
              current.path === active.path &&
              digestCanonical(current.snapshot) ===
                digestCanonical(active.snapshot)
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
      if (
        session.harnessCapabilities &&
        !session.sourceReadOnly &&
        !session.feedbackOnly
      ) {
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
      const chatOnce = (
        offered: ProviderToolDefinition[],
        thread: ProviderMessage[] = messages,
      ) =>
        completeActProviderTurn(thread, () =>
          dependencies.provider.chat(
            {
              messages: thread,
              ...(offered.length > 0
                ? { tools: valueSource ? valueSource.tools(offered) : offered }
                : {}),
            },
            session.requestContext
              ? {
                  signal: session.requestContext.signal,
                  onProgress: () =>
                    session.requestContext?.progress?.("PROVIDER_BODY"),
                }
              : {},
          ),
        );
      const readTranscriptStart = messages.length;
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
          maxRounds: 12,
          sourceReadOnly:
            session.sourceReadOnly === true && !session.componentReadOnly,
          isCancelled: () =>
            dependencies.coordinator.runs.byId(run.id)?.phase === "TERMINAL",
        });
        if (loop.incompleteReason) {
          const note =
            "아직 검색하지 않은 소스가 남아 있어 답변 근거를 확인하지 못했습니다. 부분 검색의 빈 결과만으로 함수가 없다고 판단할 수 없습니다.";
          dependencies.coordinator.runs.terminal(
            run.id,
            "UNKNOWN",
            loop.incompleteReason,
          );
          dependencies.publish(run.id, { type: "assistant_delta", text: note });
          dependencies.publish(run.id, {
            type: "activity_finished",
            stage: "FAILED",
          });
          dependencies.publish(run.id, {
            type: "run_terminal",
            outcome: "UNKNOWN",
            code: loop.incompleteReason,
          });
          dependencies.endSession(session);
          return {
            ok: true,
            state: "INCOMPLETE",
            reason: loop.incompleteReason,
            message: note,
          };
        }
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
      for (const message of messages.slice(readTranscriptStart)) {
        if (message.role === "assistant" || message.role === "tool")
          session.messages.push(message);
      }
      const planTurn = await runPlanSubmissionTurns({
        dependencies,
        session,
        active,
        run,
        requestRevision,
        observationId,
        actionTools,
        tools,
        messages,
        response,
        chatOnce,
      });
      if ("review" in planTurn) return planTurn.review;
      response = planTurn.response;
      if (
        session.executionEvidence?.length &&
        (session.feedbackOnly ||
          response.tool_calls.length === 0 ||
          response.tool_calls[0]?.name === "report_goal_status")
      ) {
        return await finishGoalFeedback({
          dependencies,
          session,
          run,
          response,
          observationId,
          observationDigest,
        });
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
      if (session.sourceReadOnly && response.tool_calls.length > 0)
        throw fail("POLICY_DENIED");
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
        return {
          ok: true,
          state: "ANSWER",
          terminal: terminal.kind,
          message: response.content,
        };
      }
      // PAH-9/R4: a recoverable proposal contract error (missing value or
      // schema shape) is returned to the model as that call's result for one
      // bounded correction turn — a fixed proposal or a clarification — and
      // never an automatic value card, a guessed execution, or an immediate
      // FAILED terminal. Cancel/permission/page-change failures stay
      // terminal, as does a second consecutive contract error.
      // Narrowed once: session.pageApiActions is always populated above,
      // and closures do not inherit that narrowing.
      const pageApiActions = session.pageApiActions ?? [];
      // Model refs are single-use nonces: a failed parse already consumed the
      // echoed ref, so a correction turn is offered fresh refs from a new
      // model snapshot — exactly what the next runStep would offer. The
      // corrected proposal resolves against the snapshot it was offered.
      let currentModel = model;
      let offeredTools = tools;
      const parseProposalCall = (targetCall: ProviderToolCall): ActProposal => {
        const parsed =
          targetCall.name === "propose_page_api"
            ? parsePageApiProposal(targetCall, pageApiActions, active.origin)
            : parseActProposal(
                valueSource ? valueSource.resolve(targetCall) : targetCall,
                currentModel.resolve,
                active.snapshot,
                session.definitions,
                session.discovery,
                targetRefId,
              );
        // PAH-9 harness binding: a text proposal without an LLM-judged value
        // is a contract error for the model, never an automatic value card.
        // Legacy pre-harness callers (no harness revision) keep the card path
        // via readiness. The core never invents the question UI here.
        // F2: missing values, missing sources, and stale sources all fail
        // here — before any review card — so the R4 correction turn applies
        // instead of a post-approval rejection in the executor. Readiness
        // keeps the same checks as defense in depth at dispatch.
        if (
          session.harnessCapabilities !== undefined &&
          (parsed.tool === "set_text_by_ref" ||
            parsed.tool === "select_option_by_ref")
        ) {
          const expectedRevision = session.requestContext
            ? toHarnessRevision(session.requestContext.generation)
            : session.harnessCapabilities.request_revision;
          if (
            (parsed.tool === "set_text_by_ref" && parsed.value === undefined) ||
            parsed.valueSourceRevision === undefined ||
            parsed.valueSourceRevision !== expectedRevision
          )
            return fail("VALUE_BINDING_INVALID");
        }
        return parsed;
      };
      let proposal: ActProposal;
      let pendingContractError: unknown = undefined;
      for (let attempt = 0; ; attempt++) {
        const call = response.tool_calls[0];
        if (response.tool_calls.length !== 1 || !call) {
          if (attempt === 0) return fail("INVALID_ARGUMENT");
          throw pendingContractError;
        }
        // PAH-9 clarification: the model asks for a missing/ambiguous value.
        // Nothing executes; the question is shown in a value card and the
        // answer returns into the same conversation for a new proposal.
        if (call.name === "request_clarification") {
          const expectedRevision = session.requestContext
            ? toHarnessRevision(session.requestContext.generation)
            : (session.harnessCapabilities?.request_revision ?? 1);
          const parsed = parseClarificationCall({
            call,
            // F1: a correction turn offers fresh refs from currentModel, so a
            // targeted question must resolve against it — never the consumed
            // first-turn map. Attempt 0 is unaffected (currentModel is model).
            resolve: (proposal) =>
              currentModel.resolve(
                proposal as Parameters<typeof currentModel.resolve>[0],
              ),
            snapshot: active.snapshot,
            expectedRevision,
          });
          dependencies.coordinator.runs.transition(run.id, "AWAITING_VALUE");
          session.messages.push({
            role: "assistant",
            content: response.content,
            tool_calls: response.tool_calls,
          });
          storeClarification(session, run.id, parsed);
          traceDecision("page-act-harness.clarification.asked", {
            value_kind: parsed.valueKind,
            has_target: parsed.targetRefId !== undefined,
            request_revision: expectedRevision,
          });
          if (response.content)
            dependencies.publish(run.id, {
              type: "assistant_delta",
              text: response.content,
            });
          dependencies.publish(run.id, {
            type: "assistant_delta",
            text: parsed.question,
          });
          dependencies.publish(run.id, {
            type: "value_required",
            action: {
              session_id: session.id,
              proposal_id: parsed.clarificationId,
              tool: "request_clarification",
              target_name: parsed.targetName ?? "입력값",
              origin: session.origin,
            },
            value_kind: parsed.valueKind,
          });
          dependencies.publish(run.id, {
            type: "activity_finished",
            stage: "AWAITING_REVIEW",
          });
          return {
            ok: true,
            state: "CLARIFICATION",
            message: parsed.question,
            clarification_id: parsed.clarificationId,
          };
        }
        try {
          proposal = parseProposalCall(call);
          break;
        } catch (error) {
          const recoverable =
            error instanceof ContractError &&
            (error.code === "INVALID_ARGUMENT" ||
              error.code === "VALUE_BINDING_INVALID") &&
            session.harnessCapabilities !== undefined &&
            dependencies.coordinator.runs.byId(run.id)?.phase !== "TERMINAL";
          if (!recoverable || attempt >= 1) throw error;
          pendingContractError = error;
          assertRequestActive(session.requestContext);
          const hint =
            error.code === "VALUE_BINDING_INVALID"
              ? "The proposal carries no usable value binding: the value is missing, its source revision is missing, or the source revision is stale. Include the exact user-supplied value with the current request revision, or call request_clarification when the request carries no clear value. Never guess a value and never invent defaults."
              : "The proposal arguments are invalid. Fix the target, value with source revision, and approval fields against the offered schema, or call request_clarification. Never guess values.";
          const assistantEcho: ProviderMessage = {
            role: "assistant",
            content: response.content,
            tool_calls: response.tool_calls,
          };
          const contractError: ProviderMessage = {
            role: "tool",
            tool_call_id: call.id,
            content: `[UNTRUSTED_TOOL_RESULT]\n${JSON.stringify({ ok: false, code: error.code, hint })}\n[/UNTRUSTED_TOOL_RESULT]`,
          };
          session.messages.push(assistantEcho, contractError);
          traceDecision("page-act-harness.value.contract_retry", {
            code: error.code,
            tool_call_id: call.id,
            attempt: attempt + 1,
          });
          currentModel = dependencies.coordinator.modelSnapshot(
            run.id,
            active.snapshot,
          );
          offeredTools = genericActTools(
            session.definitions,
            currentModel.snapshot,
            active.snapshot,
            targetRefId ? new Set([targetRefId]) : undefined,
            pageApiActions,
          );
          response = await chatOnce(offeredTools, [
            ...messages,
            assistantEcho,
            contractError,
          ]);
          assertRequestActive(session.requestContext);
        }
      }
      assertApprovedPlan(
        session,
        proposal,
        active.snapshot.document_epoch,
        requestRevision,
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
      // PAH-9/R1: a prior session approval covers only the bounded
      // session-scoped sequence it explicitly showed. A new single_step
      // proposal (text inputs always are) is never part of that approval:
      // it goes through review/approval with zero execution entries.
      if (
        session.continueAfterApproval &&
        proposal.approvalScope === "session"
      ) {
        if ((session.autoExecutionCount ?? 0) >= 12)
          return fail("WORKFLOW_STEP_LIMIT");
        session.autoExecutionCount = (session.autoExecutionCount ?? 0) + 1;
        return dependencies.executeApprovedProposal(session);
      }
      if (session.continueAfterApproval)
        traceDecision("page-act-harness.approval.single_step_requires_review", {
          tool: proposal.tool,
          approval_scope: proposal.approvalScope,
        });
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
    if (
      session.feedbackOnly ||
      session.navigationFeedback ||
      proposal.tool === "call_page_api"
    )
      return runStep(session);
    const workflow = session.workflow;
    if (!workflow || session.workflowCompleted) return runStep(session);
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
      session.workflowCompleted = true;
      delete session.continueAfterApproval;
      session.messages.push({
        role: "user",
        content:
          "The declared workflow has no remaining steps. Inspect its actual final result and the current observation to judge the original user goal; workflow termination is not goal success.",
      });
      return runStep(session);
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
