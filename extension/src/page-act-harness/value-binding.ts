import {
  traceBranch,
  traceDecision,
  traceMethod,
} from "../diagnostics/method-trace.js";
import { isSensitive } from "../security/redaction.js";
import { isOpaqueId } from "./contracts.js";

// PAH-9 internal contract: LLM-judged input values ride with the proposal
// (target + value + source revision) instead of being extracted by product
// code. No keyword/regex/fixture-name branching lives here: validation only
// checks shape, length, binding, and sensitivity. Raw values never enter
// traces, diagnostics, or exports — only lengths, digests-agnostic counts,
// and revision linkage.

export const MAX_LLM_TEXT_VALUE_LENGTH = 4096;
export const MAX_LLM_OPTION_VALUE_LENGTH = 160;
export const MAX_CLARIFICATION_QUESTION_LENGTH = 2000;

export type LlmValueSource = {
  value: string;
  value_source_revision: number;
};

export type ClarificationRequest = {
  question: string;
  value_kind: "text" | "option";
  target?: string;
  request_revision: number;
};

const fail = (
  context: unknown,
  method: string,
  code: string,
  condition: string,
): never => {
  traceBranch(context as never, method, "fail", code, condition);
  throw new Error(code);
};

export const validateLlmTextValue = (value: unknown): string =>
  traceMethod(
    "page-act-harness/value-binding.ts:validateLlmTextValue",
    {},
    (context) => {
      const method = "page-act-harness/value-binding.ts:validateLlmTextValue";
      if (typeof value !== "string")
        fail(context, method, "INVALID_ARGUMENT", "value must be a string");
      const text = value as string;
      if (text.length === 0)
        fail(context, method, "INVALID_ARGUMENT", "value must not be empty");
      if ([...text].length > MAX_LLM_TEXT_VALUE_LENGTH)
        fail(
          context,
          method,
          "INVALID_ARGUMENT",
          "text value exceeds 4096 characters",
        );
      if (text.includes("\0"))
        fail(context, method, "INVALID_ARGUMENT", "value contains NUL");
      traceDecision("page-act-harness.value.validated", {
        value_length: [...text].length,
        kind: "text",
      });
      return text;
    },
  );

export const validateLlmOptionValue = (
  value: unknown,
  allowed: readonly string[],
): string =>
  traceMethod(
    "page-act-harness/value-binding.ts:validateLlmOptionValue",
    {},
    (context) => {
      const method = "page-act-harness/value-binding.ts:validateLlmOptionValue";
      if (typeof value !== "string")
        fail(
          context,
          method,
          "INVALID_ARGUMENT",
          "option value must be string",
        );
      const text = value as string;
      if (!allowed.includes(text))
        fail(
          context,
          method,
          "INVALID_ARGUMENT",
          "option value not in supplied enum",
        );
      if ([...text].length > MAX_LLM_OPTION_VALUE_LENGTH)
        fail(context, method, "INVALID_ARGUMENT", "option value too long");
      if (/[\r\n\0]/.test(text))
        fail(context, method, "INVALID_ARGUMENT", "option value has newline");
      traceDecision("page-act-harness.value.validated", {
        value_length: [...text].length,
        kind: "option",
      });
      return text;
    },
  );

export const validateValueSourceRevision = (
  revision: unknown,
  expected?: number,
): number =>
  traceMethod(
    "page-act-harness/value-binding.ts:validateValueSourceRevision",
    {},
    (context) => {
      const method =
        "page-act-harness/value-binding.ts:validateValueSourceRevision";
      if (
        typeof revision !== "number" ||
        !Number.isInteger(revision) ||
        revision < 1
      )
        fail(
          context,
          method,
          "INVALID_ARGUMENT",
          "value_source_revision must be an integer >= 1",
        );
      const rev = revision as number;
      if (expected !== undefined && rev !== expected)
        fail(
          context,
          method,
          "STALE_REQUEST_REVISION",
          "value source revision does not match current request",
        );
      traceDecision("page-act-harness.value.source_bound", {
        value_source_revision: rev,
        ...(expected !== undefined ? { expected_revision: expected } : {}),
      });
      return rev;
    },
  );

export const isBlockedValueTarget = (opts: {
  role: string;
  name: string;
  autocomplete?: string;
}): boolean =>
  traceMethod(
    "page-act-harness/value-binding.ts:isBlockedValueTarget",
    {},
    () => {
      // Credential-role or credential-named targets never accept LLM values.
      // This is a policy gate on the target, not a classification of the
      // request text: the request wording never changes this decision.
      if (
        opts.role === "password" ||
        opts.role === "otp" ||
        opts.role === "one-time-code"
      )
        return true;
      return isSensitive(opts.role, opts.name, opts.autocomplete);
    },
  );

export const validateClarificationRequest = (opts: {
  question: unknown;
  value_kind: unknown;
  target?: unknown;
  request_revision: number;
}): ClarificationRequest =>
  traceMethod(
    "page-act-harness/value-binding.ts:validateClarificationRequest",
    {},
    (context) => {
      const method =
        "page-act-harness/value-binding.ts:validateClarificationRequest";
      if (
        typeof opts.question !== "string" ||
        opts.question.trim().length === 0 ||
        [...opts.question].length > MAX_CLARIFICATION_QUESTION_LENGTH
      )
        fail(context, method, "INVALID_ARGUMENT", "question 1..2000 chars");
      if (opts.value_kind !== "text" && opts.value_kind !== "option")
        fail(context, method, "INVALID_ARGUMENT", "value_kind text|option");
      if (
        opts.target !== undefined &&
        (typeof opts.target !== "string" || opts.target.length === 0)
      )
        fail(context, method, "INVALID_ARGUMENT", "target must be a ref");
      if (!Number.isInteger(opts.request_revision) || opts.request_revision < 1)
        fail(context, method, "INVALID_ARGUMENT", "request_revision >= 1");
      const question = (opts.question as string).trim();
      traceDecision("page-act-harness.clarification.requested", {
        question_length: [...question].length,
        value_kind: opts.value_kind,
        has_target: opts.target !== undefined,
        request_revision: opts.request_revision,
      });
      return {
        question,
        value_kind: opts.value_kind as "text" | "option",
        ...(typeof opts.target === "string" ? { target: opts.target } : {}),
        request_revision: opts.request_revision,
      };
    },
  );

export const validateClarificationAnswer = (
  value: unknown,
  kind: "text" | "option",
  allowedOptionValues?: readonly string[],
): string =>
  traceMethod(
    "page-act-harness/value-binding.ts:validateClarificationAnswer",
    { kind },
    (context) => {
      const method =
        "page-act-harness/value-binding.ts:validateClarificationAnswer";
      if (typeof value !== "string" || value.length === 0)
        fail(
          context,
          method,
          "VALUE_BINDING_INVALID",
          "answer must not be empty",
        );
      const text = value as string;
      if (text.includes("\0"))
        fail(context, method, "VALUE_BINDING_INVALID", "answer contains NUL");
      if (kind === "text") {
        if ([...text].length > MAX_LLM_TEXT_VALUE_LENGTH)
          fail(context, method, "VALUE_BINDING_INVALID", "answer too long");
      } else {
        if ([...text].length > MAX_LLM_OPTION_VALUE_LENGTH)
          fail(
            context,
            method,
            "VALUE_BINDING_INVALID",
            "option answer too long",
          );
        if (/[\r\n]/.test(text))
          fail(context, method, "VALUE_BINDING_INVALID", "option newline");
        if (allowedOptionValues && !allowedOptionValues.includes(text))
          fail(
            context,
            method,
            "VALUE_BINDING_INVALID",
            "option answer not in enum",
          );
      }
      // Only lengths travel to diagnostics; the raw answer never does.
      traceDecision("page-act-harness.clarification.answered", {
        answer_length: [...text].length,
        kind,
      });
      return text;
    },
  );

// Safe diagnostics summary: binding + verdict + verifier outcome. The raw
// value never appears here; export/mask layers must keep it that way.
export const describeValueBinding = (opts: {
  has_value: boolean;
  value_length?: number;
  value_source_revision?: number;
  request_revision: number;
  target_ref_present: boolean;
  verifier_result?: string;
}): Record<string, unknown> =>
  traceMethod(
    "page-act-harness/value-binding.ts:describeValueBinding",
    {},
    () => {
      traceDecision("page-act-harness.value.described", {
        has_value: opts.has_value,
        request_revision: opts.request_revision,
      });
      return {
        has_value: opts.has_value,
        ...(opts.value_length !== undefined
          ? { value_length: opts.value_length }
          : {}),
        ...(opts.value_source_revision !== undefined
          ? { value_source_revision: opts.value_source_revision }
          : {}),
        request_revision: opts.request_revision,
        target_ref_present: opts.target_ref_present,
        ...(opts.verifier_result !== undefined
          ? { verifier_result: opts.verifier_result }
          : {}),
        masking: {
          applied: true,
          categories: ["input_value"],
          redacted_count: opts.has_value ? 1 : 0,
        },
      };
    },
  );

export const isOpaqueRef = (value: string): boolean => isOpaqueId(value);
