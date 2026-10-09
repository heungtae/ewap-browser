import { fail } from "../security/validation.js";
import { traceDecision } from "../diagnostics/method-trace.js";
import { toHarnessRevision } from "../page-act-harness/act-entry-bridge.js";
import { validateClarificationAnswer } from "../page-act-harness/value-binding.js";
import type { Capability } from "../policy/permission-manager.js";
import type {
  EnterprisePolicyDecision,
  EnterprisePolicyRequest,
} from "../policy/enterprise-policy.js";
import type { ReadyExecution } from "../state/mutation-coordinator.js";
import type { Run } from "../state/run-coordinator.js";
import type { ServiceCoordinator } from "./coordinator.js";
import type { ActSession } from "./act-session-types.js";
import type { ParsedActProposal } from "./act-proposal-parser.js";
import type { AuditEvent } from "../security/audit.js";
import { authorizeActWithEvidence } from "./act-policy-evidence.js";

type Complete = (
  session: ActSession,
  run: Run,
  proposal: ParsedActProposal,
  executed: Record<string, unknown>,
  summaries: { success: string; failure: string },
) => Promise<Record<string, unknown>>;
type Dependencies = {
  coordinator: ServiceCoordinator;
  authorizeEnterprise(
    request: EnterprisePolicyRequest,
  ): Promise<EnterprisePolicyDecision>;
  evidence?(event: AuditEvent): Promise<unknown>;
  getRun(runId: string): Run | undefined;
  execute(
    run: Run,
    ready: ReadyExecution,
    origin: string,
  ): Promise<Record<string, unknown>>;
  complete: Complete;
  // PAH-9 clarification continuation: after a clarification answer, the same
  // conversation continues with a new model proposal. Wired to the step
  // runner in product; absent in unit paths (answer is then only recorded).
  continueAfterClarification?: (
    session: ActSession,
  ) => Promise<Record<string, unknown>>;
};

const capabilityFor = (
  proposal: ParsedActProposal,
): Exclude<Capability, "collection_read" | "page_api_read"> =>
  proposal.tool === "navigate"
    ? "navigate"
    : proposal.tool === "set_checked_by_ref" ||
        proposal.tool === "click_by_ref" ||
        proposal.tool === "press_key_by_ref"
      ? "click"
      : "type";

export const createActProposalFollowup = (dependencies: Dependencies) => {
  const authorizeResume = async (
    session: ActSession,
    run: Run,
    proposal: ParsedActProposal,
  ): Promise<void> => {
    await authorizeActWithEvidence({
      session,
      run,
      capability: capabilityFor(proposal),
      risk: proposal.definition.risk,
      authorizeEnterprise: dependencies.authorizeEnterprise,
      evidence: dependencies.evidence ?? (async () => undefined),
    });
  };
  const submitValue = async (
    session: ActSession,
    value: string,
  ): Promise<Record<string, unknown>> => {
    // PAH-9 clarification answers take precedence: they return into the same
    // model conversation for a new proposal instead of executing directly.
    // Single-use and revision-bound; Stop/navigation/restart discards without
    // reuse and never dispatches a mutation.
    const clarification = session.awaitingClarification;
    if (clarification) {
      const run = dependencies.getRun(clarification.runId);
      if (!run || run.phase === "TERMINAL") {
        delete session.awaitingClarification;
        return fail("VALUE_BINDING_INVALID");
      }
      if (session.requestContext?.signal.aborted) {
        delete session.awaitingClarification;
        return fail("POLICY_DENIED");
      }
      const expectedRevision = session.harnessCapabilities
        ? session.requestContext
          ? toHarnessRevision(session.requestContext.generation)
          : session.harnessCapabilities.request_revision
        : clarification.requestRevision;
      if (
        expectedRevision !== clarification.requestRevision ||
        (session.harnessCapabilities !== undefined &&
          clarification.requestRevision !== expectedRevision)
      ) {
        delete session.awaitingClarification;
        return fail("VALUE_BINDING_INVALID");
      }
      let answer: string;
      try {
        answer = validateClarificationAnswer(value, clarification.valueKind);
      } catch {
        return fail("VALUE_BINDING_INVALID");
      }
      // Consume first: duplicate or late answers never re-enter the loop.
      const toolCallId = clarification.toolCallId;
      const questionLength = [...clarification.question].length;
      delete session.awaitingClarification;
      traceDecision("page-act-harness.clarification.answered", {
        answer_length: [...answer].length,
        question_length: questionLength,
        value_kind: clarification.valueKind,
        request_revision: clarification.requestRevision,
      });
      session.messages.push({
        role: "tool",
        tool_call_id: toolCallId,
        content: `[UNTRUSTED_TOOL_RESULT]\n${JSON.stringify({
          clarification_id: clarification.clarificationId,
          request_revision: clarification.requestRevision,
          answer,
        })}\n[/UNTRUSTED_TOOL_RESULT]`,
      });
      session.messages.push({
        role: "user",
        content: `User clarification answer (revision ${clarification.requestRevision}): ${answer}`,
      });
      if (dependencies.continueAfterClarification)
        return dependencies.continueAfterClarification(session);
      return { ok: true, state: "CLARIFICATION_ANSWERED" };
    }
    const awaiting = session.awaitingValue;
    const proposal = session.proposal;
    const run = awaiting ? dependencies.getRun(awaiting.runId) : undefined;
    if (
      !awaiting ||
      !proposal ||
      proposal.tool === "call_page_api" ||
      !run ||
      run.phase === "TERMINAL" ||
      awaiting.valueKind !== "text" ||
      value.length === 0 ||
      value.length > 16_384
    )
      return fail("VALUE_BINDING_INVALID");
    await authorizeResume(session, run, proposal);
    const next = dependencies.coordinator.mutations.submitValue(
      run,
      awaiting.valueSlotId,
      value,
    );
    if (next.state !== "READY_TO_EXECUTE") return fail("CONFIRMATION_INVALID");
    delete session.awaitingValue;
    return dependencies.complete(
      session,
      run,
      proposal,
      await dependencies.execute(
        run,
        dependencies.coordinator.mutations.executeR1(run),
        session.origin,
      ),
      {
        success: "입력 결과를 확인했습니다.",
        failure: "입력 작업을 완료하지 못했습니다.",
      },
    );
  };
  const confirmProposal = async (
    session: ActSession,
    confirmationId: string,
    confirmationNonce: string,
  ): Promise<Record<string, unknown>> => {
    const awaiting = session.awaitingConfirmation;
    const proposal = session.proposal;
    const run = awaiting ? dependencies.getRun(awaiting.runId) : undefined;
    if (
      !awaiting ||
      !proposal ||
      proposal.tool === "call_page_api" ||
      !run ||
      run.phase !== "AWAITING_CONFIRMATION" ||
      awaiting.confirmationId !== confirmationId ||
      awaiting.confirmationNonce !== confirmationNonce
    )
      return fail("CONFIRMATION_INVALID");
    await authorizeResume(session, run, proposal);
    delete session.awaitingConfirmation;
    return dependencies.complete(
      session,
      run,
      proposal,
      await dependencies.execute(
        run,
        dependencies.coordinator.mutations.confirm(
          run,
          confirmationId,
          confirmationNonce,
        ),
        session.origin,
      ),
      {
        success: "확인된 작업 결과를 검증했습니다.",
        failure: "확인 작업을 완료하지 못했습니다.",
      },
    );
  };
  return { confirmProposal, submitValue };
};
