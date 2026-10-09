import { describe, expect, it } from "vitest";
import {
  describeValueBinding,
  validateClarificationAnswer,
  validateClarificationRequest,
  validateLlmOptionValue,
  validateLlmTextValue,
  validateValueSourceRevision,
  isBlockedValueTarget,
} from "../../../src/page-act-harness/value-binding.js";
import {
  methodTraceSnapshot,
  setMethodTraceLevel,
  withMethodContext,
} from "../../../src/diagnostics/method-trace.js";

describe("pah-9 value binding contract", () => {
  it("accepts_a_clear_text_value_with_its_source_revision", () => {
    expect(validateLlmTextValue("browser test")).toBe("browser test");
    expect(validateValueSourceRevision(1, 1)).toBe(1);
  });

  it("rejects_empty_overlong_or_nul_values_without_keyword_branching", () => {
    expect(() => validateLlmTextValue("")).toThrow("INVALID_ARGUMENT");
    expect(() => validateLlmTextValue("a".repeat(4097))).toThrow(
      "INVALID_ARGUMENT",
    );
    expect(() => validateLlmTextValue("a\0b")).toThrow("INVALID_ARGUMENT");
    expect(() => validateValueSourceRevision(0, 1)).toThrow("INVALID_ARGUMENT");
    expect(() => validateValueSourceRevision(2, 1)).toThrow(
      "STALE_REQUEST_REVISION",
    );
  });

  it("binds_option_values_only_to_the_supplied_enum", () => {
    expect(validateLlmOptionValue("Detailed", ["Brief", "Detailed"])).toBe(
      "Detailed",
    );
    expect(() =>
      validateLlmOptionValue("Unknown", ["Brief", "Detailed"]),
    ).toThrow("INVALID_ARGUMENT");
    expect(() => validateLlmOptionValue("a\nb", ["a\nb"])).toThrow(
      "INVALID_ARGUMENT",
    );
  });

  it("blocks_credential_named_targets_regardless_of_request_wording", () => {
    expect(
      isBlockedValueTarget({ role: "textbox", name: "Search query" }),
    ).toBe(false);
    expect(
      isBlockedValueTarget({ role: "textbox", name: "Account password" }),
    ).toBe(true);
    expect(
      isBlockedValueTarget({
        role: "textbox",
        name: "Code",
        autocomplete: "one-time-code",
      }),
    ).toBe(true);
  });

  it("asks_only_with_a_bounded_question_and_returns_answers_without_raw_leak", () => {
    const asked = validateClarificationRequest({
      question: "검색값을 알려주세요.",
      value_kind: "text",
      request_revision: 1,
    });
    expect(asked.question).toContain("검색값");
    expect(() =>
      validateClarificationRequest({
        question: "",
        value_kind: "text",
        request_revision: 1,
      }),
    ).toThrow("INVALID_ARGUMENT");
    expect(validateClarificationAnswer("browser test", "text")).toBe(
      "browser test",
    );
    expect(() => validateClarificationAnswer("", "text")).toThrow(
      "VALUE_BINDING_INVALID",
    );
  });

  it("describes_binding_for_diagnostics_without_the_raw_value", () => {
    const summary = describeValueBinding({
      has_value: true,
      value_length: 12,
      value_source_revision: 1,
      request_revision: 1,
      target_ref_present: true,
      verifier_result: "EXPECTED_STATE_MATCHED",
    });
    expect(JSON.stringify(summary)).not.toContain("browser test");
    expect(summary).toMatchObject({
      has_value: true,
      value_length: 12,
      value_source_revision: 1,
      request_revision: 1,
    });
  });

  it("keeps_raw_values_out_of_method_records_and_request_snapshots", () => {
    // R2: validator returns are user values; only lengths/kinds/revisions
    // may reach method records and request diagnostics.
    setMethodTraceLevel("trace");
    const requestId = "77777777-7777-7777-7777-777777777777";
    const synthetic = "amber-moss-review-synthetic-7q";
    withMethodContext(
      { call_id: "call-abcdefghijklmnop", request_id: requestId },
      () => {
        validateClarificationAnswer(synthetic, "text");
        validateLlmTextValue(synthetic);
      },
    );
    const snapshot = methodTraceSnapshot("worker", requestId);
    const text = JSON.stringify(snapshot);
    expect(snapshot.records.length).toBeGreaterThan(0);
    expect(text).not.toContain(synthetic);
    expect(text).toContain("answer_length");
  });
});
