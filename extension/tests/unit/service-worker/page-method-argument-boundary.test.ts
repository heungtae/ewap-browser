import { expect, it } from "vitest";
import { parsePageMethodProposal } from "../../../src/service-worker/act-proposal-parser.js";
import type { PageMethodRef } from "../../../src/contracts/page-method-types.js";

const method: PageMethodRef = {
  method_ref: "method-ref-abcdefghijklmnop",
  object_path: ["app", "calculate"],
  method_name: "calculate",
  arity: 2,
  function_kind: "unknown",
  locator_revision: "identity-token",
};
it.each(
  [
    [],
    [1],
    [1, { password: "private" }],
    [1, "authorization=Bearer abcdefghijklmnop"],
    [1, "x".repeat(4097)],
    Array.from({ length: 33 }, () => 1),
  ].map((arguments_) => ({ arguments_ })),
)(
  "rejects incomplete, sensitive and oversized arguments $arguments_",
  ({ arguments_ }) => {
    expect(() =>
      parsePageMethodProposal(
        {
          id: "call-abcdefghijklmnop",
          name: "propose_page_method_call",
          arguments: JSON.stringify({
            method_ref: method.method_ref,
            source_evidence_id: "source-abcdefghijklmnop",
            arguments: arguments_,
            purpose: "Calculate the requested values",
            approval_scope: "single_step",
            approval_reason: "Requested calculation",
          }),
        },
        [method],
        "https://example.com",
        new Map([
          [
            "source-abcdefghijklmnop",
            "function calculate(left, right) { return left + right; }",
          ],
        ]),
      ),
    ).toThrow();
  },
);
