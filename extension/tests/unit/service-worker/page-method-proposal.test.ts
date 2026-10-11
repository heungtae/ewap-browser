import { describe, expect, it } from "vitest";
import { parsePageMethodProposal } from "../../../src/service-worker/act-proposal-parser.js";
import { genericActTools } from "../../../src/service-worker/act-tools.js";
import type { PageMethodRef } from "../../../src/contracts/page-method-types.js";
import { pageMethodSourceEvidence } from "../../../src/service-worker/page-method-source-evidence.js";

describe("page method proposal contract", () => {
  it("accepts grounding IDs only from successful read_page_resource results", () => {
    const evidence = pageMethodSourceEvidence([
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "read-call-abcdefghijkl",
            name: "read_page_resource",
            arguments: "{}",
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "read-call-abcdefghijkl",
        content: `[UNTRUSTED_TOOL_RESULT]\n${JSON.stringify({ status: "AVAILABLE", evidence_id: "source-evidence-abcdefghijkl", content: { text: "function read(input) {}" } })}\n[/UNTRUSTED_TOOL_RESULT]`,
      },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "other-call-abcdefghijkl",
            name: "list_page_resources",
            arguments: "{}",
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "other-call-abcdefghijkl",
        content: `[UNTRUSTED_TOOL_RESULT]\n${JSON.stringify({ status: "AVAILABLE", evidence_id: "foreign-evidence-abcdefgh", content: { text: "function read(input) {}" } })}\n[/UNTRUSTED_TOOL_RESULT]`,
      },
    ]);
    expect(evidence.has("source-evidence-abcdefghijkl")).toBe(true);
    expect(evidence.has("foreign-evidence-abcdefgh")).toBe(false);
  });

  it("offers only discovered opaque refs and rejects altered or oversized proposals", () => {
    const method: PageMethodRef = {
      method_ref: "method-ref-abcdefghijklmnop",
      object_path: ["app", "api", "read"],
      method_name: "read",
      arity: 1,
      function_kind: "unknown",
      locator_revision: "read:1:12:abcd",
    };
    const tools = genericActTools(
      [],
      { document_epoch: "epoch", frame_id: 0, nodes: [], visible_text: "" },
      {
        schema_version: 2,
        document_epoch: "epoch",
        frame_id: 0,
        nodes: [],
        visible_text: "",
      },
      undefined,
      [],
      [method],
    );
    expect(tools.map((item) => item.function.name)).toContain(
      "propose_page_method_call",
    );
    const proposal = parsePageMethodProposal(
      {
        id: "tool-call-abcdefghijkl",
        name: "propose_page_method_call",
        arguments: JSON.stringify({
          method_ref: method.method_ref,
          source_evidence_id: "source-evidence-abcdefghijkl",
          arguments: ["x"],
          purpose: "조회",
          approval_scope: "single_step",
          approval_reason: "요청 확인",
        }),
      },
      [method],
      "https://example.com",
      new Map([
        [
          "source-evidence-abcdefghijkl",
          "function read(input) { return input; }",
        ],
      ]),
    );
    expect(proposal.approvalDigest.length).toBeGreaterThan(32);
    expect(() =>
      parsePageMethodProposal(
        {
          id: "tool-call-abcdefghijkl",
          name: "propose_page_method_call",
          arguments: JSON.stringify({
            method_ref: method.method_ref,
            source_evidence_id: "source-evidence-abcdefghijkl",
            arguments: ["x"],
            code: "fetch('/')",
            purpose: "조회",
            approval_scope: "single_step",
            approval_reason: "요청 확인",
          }),
        },
        [method],
        "https://example.com",
        new Map([
          [
            "source-evidence-abcdefghijkl",
            "function read(input) { return input; }",
          ],
        ]),
      ),
    ).toThrow();
    expect(() =>
      parsePageMethodProposal(
        {
          id: "tool-call-abcdefghijkl",
          name: "propose_page_method_call",
          arguments: JSON.stringify({
            method_ref: method.method_ref,
            source_evidence_id: "foreign-evidence-abcdefgh",
            arguments: ["x"],
            purpose: "조회",
            approval_scope: "single_step",
            approval_reason: "요청 확인",
          }),
        },
        [method],
        "https://example.com",
        new Map(),
      ),
    ).toThrow();
  });
});
