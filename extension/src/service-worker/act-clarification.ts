import { traceDecision, traceMethod } from "../diagnostics/method-trace.js";
import { opaqueId } from "../security/canonical.js";
import { fail } from "../security/validation.js";
import { validateClarificationRequest } from "../page-act-harness/value-binding.js";
import { isSensitive } from "../security/redaction.js";
import type { ActSession } from "./act-session-types.js";

export type ParsedClarification = {
  clarificationId: string;
  question: string;
  valueKind: "text" | "option";
  targetRefId?: string;
  targetName?: string;
  requestRevision: number;
  toolCallId: string;
};

// PAH-9 clarification turn: the model asks for a missing/ambiguous value.
// Nothing executes here; the question is shown in a value card and the answer
// returns into the same conversation for a new input proposal. Raw answers
// are never stored in the session — only the question, kinds, and revision
// linkage. Single-use: Stop/navigation/restart discards without reuse.
export const parseClarificationCall = (opts: {
  call: { id: string; name: string; arguments: string };
  resolve: (proposal: { target: string; tool: string }) => string;
  snapshot: {
    nodes: Array<{
      ref_id: string;
      role: string;
      name: string;
      visible: boolean;
      enabled: boolean;
    }>;
  };
  expectedRevision: number;
}): ParsedClarification =>
  traceMethod(
    "service-worker/act-clarification.ts:parseClarificationCall",
    {},
    () => {
      const { call, resolve, snapshot, expectedRevision } = opts;
      if (call.name !== "request_clarification") throw fail("INVALID_ARGUMENT");
      let raw: unknown;
      try {
        raw = JSON.parse(call.arguments);
      } catch {
        throw fail("INVALID_ARGUMENT");
      }
      if (
        typeof raw !== "object" ||
        raw === null ||
        Array.isArray(raw) ||
        typeof (raw as { question?: unknown }).question !== "string" ||
        ((raw as { value_kind?: unknown }).value_kind !== "text" &&
          (raw as { value_kind?: unknown }).value_kind !== "option")
      )
        throw fail("INVALID_ARGUMENT");
      const allowedKeys = ["question", "value_kind", "target"];
      if (
        Object.keys(raw as Record<string, unknown>).some(
          (key) => !allowedKeys.includes(key),
        )
      )
        throw fail("INVALID_ARGUMENT");
      const question = (raw as { question: string }).question;
      const valueKind = (raw as { value_kind: "text" | "option" }).value_kind;
      const targetModelRef =
        typeof (raw as { target?: unknown }).target === "string"
          ? ((raw as { target: string }).target as string)
          : undefined;
      const validated = validateClarificationRequest({
        question,
        value_kind: valueKind,
        ...(targetModelRef !== undefined ? { target: targetModelRef } : {}),
        request_revision: expectedRevision,
      });
      let targetRefId: string | undefined;
      let targetName: string | undefined;
      if (targetModelRef !== undefined) {
        const tool =
          valueKind === "text" ? "set_text_by_ref" : "select_option_by_ref";
        let resolved: string;
        try {
          resolved = resolve({ target: targetModelRef, tool });
        } catch {
          throw fail("TARGET_NOT_ACTIONABLE");
        }
        const node = snapshot.nodes.find((item) => item.ref_id === resolved);
        if (
          !node ||
          !node.visible ||
          !node.enabled ||
          node.role === "password" ||
          isSensitive(node.role, node.name)
        )
          throw fail("TARGET_NOT_ACTIONABLE");
        targetRefId = node.ref_id;
        targetName = node.name;
      }
      traceDecision("page-act-harness.clarification.parsed", {
        value_kind: validated.value_kind,
        has_target: targetRefId !== undefined,
        request_revision: expectedRevision,
      });
      return {
        clarificationId: opaqueId(),
        question: validated.question,
        valueKind: validated.value_kind,
        ...(targetRefId !== undefined ? { targetRefId } : {}),
        ...(targetName !== undefined ? { targetName } : {}),
        requestRevision: expectedRevision,
        toolCallId: call.id,
      };
    },
  );

export const storeClarification = (
  session: ActSession,
  runId: string,
  parsed: ParsedClarification,
): void => {
  // Any pending legacy value/confirmation is discarded: a new clarification
  // supersedes it and must not be combined into a duplicate mutation.
  delete session.awaitingValue;
  delete session.awaitingConfirmation;
  session.awaitingClarification = {
    runId,
    clarificationId: parsed.clarificationId,
    question: parsed.question,
    valueKind: parsed.valueKind,
    ...(parsed.targetRefId !== undefined
      ? { targetRefId: parsed.targetRefId }
      : {}),
    ...(parsed.targetName !== undefined
      ? { targetName: parsed.targetName }
      : {}),
    requestRevision: parsed.requestRevision,
    toolCallId: parsed.toolCallId,
  };
};
