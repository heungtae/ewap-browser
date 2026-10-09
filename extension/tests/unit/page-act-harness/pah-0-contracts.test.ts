import { describe, expect, it } from "vitest";
import {
  PAGE_ACT_CONTEXT_VERSION,
  isOpaqueId,
  isStaleBinding,
  nextHarnessState,
  validateBootstrapEnvelope,
  validateReadEvidence,
  type BootstrapEnvelope,
  type ReadEvidence,
} from "../../../src/page-act-harness/contracts.js";
import {
  PAH0_COMPATIBILITY_TABLE,
  assertNoExternalWireChange,
  decideContractOwner,
  summarizePreviewInputRepro,
} from "../../../src/page-act-harness/compatibility.js";

// PAH-0 contract/unit scope only: validates envelope/evidence/state-machine
// inputs. It does not prove model suitability or live reasoning (§12).
const envelope = (): BootstrapEnvelope => ({
  context_version: PAGE_ACT_CONTEXT_VERSION,
  request: {
    request_id: "request-abcdefghijklmnop",
    revision: 1,
    mode: "act",
    text: "Search query에 browser test를 입력해줘.",
  },
  binding: {
    document_epoch: "epoch-abcdefghijklmnop",
    page_scope_epoch: "scope-abcdefghijklmnop",
  },
  observation: {
    evidence_id: "ev-ui-abcdefghijklmnop",
    scope: "visible_only",
    controls: [
      {
        model_ref: "m1",
        role: "textbox",
        name: "Search query",
        visible: true,
        enabled: true,
      },
    ],
    coverage: { complete: false, reason: "INITIAL_SUMMARY" },
  },
  resources: {
    inventory_id: "inventory-abcdefghijklm",
    items: [
      {
        resource_id: "section-abcdefghijklm",
        kind: "page_description",
        state: "AVAILABLE",
      },
    ],
    next_cursor: null,
  },
  workflow_inventory: {
    sources: ["saved", "profile", "page_generated"],
    state: "NOT_READ",
  },
  capabilities: {
    read: ["read_page", "get_page_text"],
    propose: ["propose_set_text"],
    script_read: "CONSENT_REQUIRED",
  },
});

const evidence = (): ReadEvidence => ({
  evidence_id: "ev-read-abcdefghijklmnop",
  request_revision: 1,
  binding_revision: "epoch-abcdefghijklmnop",
  resource_id: "section-abcdefghijklm",
  resource_revision: "rev-abcdefghijklmnop",
  kind: "page_description",
  status: "AVAILABLE",
  coverage: { scope: "section", complete: true, truncated: false },
  masking: { applied: true, categories: ["url-secret"], redacted_count: 1 },
  limitations: [],
});

describe("PAH-0 internal contracts", () => {
  it("accepts_a_minimal_bootstrap_envelope_and_rejects_complete_overclaim", () => {
    expect(validateBootstrapEnvelope(envelope()).request.revision).toBe(1);
    expect(() =>
      validateBootstrapEnvelope({
        ...envelope(),
        observation: {
          ...envelope().observation,
          coverage: { complete: true, reason: "FULL" },
        },
      }),
    ).toThrow("COVERAGE_OVERCLAIM");
  });

  it("rejects_non_opaque_ids_for_request_binding_inventory_and_resource", () => {
    expect(isOpaqueId("request-abcdefghijklmnop")).toBe(true);
    expect(isOpaqueId("_base64url-abcdefghijklmnop")).toBe(true);
    expect(isOpaqueId("-base64url-abcdefghijklmnop")).toBe(true);
    expect(isOpaqueId("http://x/y?z=1")).toBe(false);
    expect(() =>
      validateBootstrapEnvelope({
        ...envelope(),
        request: { ...envelope().request, request_id: "http://x/y" },
      }),
    ).toThrow("REQUEST_ID_INVALID");
    expect(() =>
      validateBootstrapEnvelope({
        ...envelope(),
        binding: {
          document_epoch: "https://x/?token=1",
          page_scope_epoch: "scope-abcdefghijklmnop",
        },
      }),
    ).toThrow("BINDING_INVALID");
    expect(() =>
      validateBootstrapEnvelope({
        ...envelope(),
        resources: {
          ...envelope().resources,
          items: [
            {
              resource_id: "https://x/app.js",
              kind: "inline_script",
              state: "AVAILABLE",
            },
          ],
        },
      }),
    ).toThrow("RESOURCE_ID_INVALID");
    expect(() =>
      validateBootstrapEnvelope({
        ...envelope(),
        request: { ...envelope().request, text: "" },
      }),
    ).toThrow("REQUEST_TEXT_INVALID");
  });

  it("requires_continuation_for_truncated_reads_and_blocks_body_leak", () => {
    expect(validateReadEvidence(evidence()).status).toBe("AVAILABLE");
    expect(() =>
      validateReadEvidence({
        ...evidence(),
        coverage: { scope: "script", complete: false, truncated: true },
      }),
    ).toThrow("CONTINUATION_REQUIRED");
    expect(() =>
      validateReadEvidence({
        ...evidence(),
        status: "CONSENT_REQUIRED",
        content: "secret-body",
      }),
    ).toThrow("CONSENT_BODY_LEAK");
    expect(() =>
      validateReadEvidence({
        ...evidence(),
        status: "FAILED",
        content: "partial-body",
      }),
    ).toThrow("FAILURE_BODY_LEAK");
    expect(() =>
      validateReadEvidence({
        ...evidence(),
        status: "DENIED",
        coverage: { scope: "script", complete: true, truncated: false },
      }),
    ).toThrow("FAILURE_COMPLETE_OVERCLAIM");
  });

  it("rejects_inventory_not_read_passed_as_a_read_status", () => {
    expect(() =>
      validateReadEvidence({
        ...evidence(),
        status: "NOT_READ" as unknown as ReadEvidence["status"],
      }),
    ).toThrow("INVALID_STATUS_CONFUSION");
  });

  it("rejects_approval_event_in_reasoning_and_supports_bootstrap_entry", () => {
    expect(nextHarnessState("BOOTSTRAPPING", "BOOTSTRAP_DONE")).toBe(
      "REASONING",
    );
    expect(nextHarnessState("REASONING", "NEEDS_READ")).toBe("READING");
    expect(nextHarnessState("READING", "READ_DONE")).toBe("REASONING");
    expect(() => nextHarnessState("REASONING", "APPROVED")).toThrow(
      "STATE_TRANSITION_INVALID",
    );
  });

  it("routes_stop_stale_provider_and_budget_to_terminal", () => {
    expect(nextHarnessState("READING", "STOP")).toBe("TERMINAL");
    expect(nextHarnessState("EXECUTING", "STALE_BINDING")).toBe("TERMINAL");
    expect(nextHarnessState("VERIFYING", "BUDGET_EXHAUSTED")).toBe("TERMINAL");
  });

  it("detects_navigation_staleness_without_logging_raw_epochs", () => {
    expect(
      isStaleBinding(
        {
          document_epoch: "a-abcdefghijklmnop",
          page_scope_epoch: "s1-abcdefghijklm",
        },
        {
          document_epoch: "b-abcdefghijklmnop",
          page_scope_epoch: "s1-abcdefghijklm",
        },
      ),
    ).toBe(true);
    expect(
      isStaleBinding(
        {
          document_epoch: "a-abcdefghijklmnop",
          page_scope_epoch: "s1-abcdefghijklm",
        },
        {
          document_epoch: "a-abcdefghijklmnop",
          page_scope_epoch: "s2-abcdefghijklm",
        },
      ),
    ).toBe(true);
    expect(
      isStaleBinding(
        {
          document_epoch: "a-abcdefghijklmnop",
          page_scope_epoch: "s1-abcdefghijklm",
        },
        {
          document_epoch: "a-abcdefghijklmnop",
          page_scope_epoch: "s1-abcdefghijklm",
        },
      ),
    ).toBe(false);
  });

  it("keeps_wire_stable_and_rejects_unreviewed_contract_areas", () => {
    expect(
      assertNoExternalWireChange(PAH0_COMPATIBILITY_TABLE).length,
    ).toBeGreaterThan(0);
    expect(() =>
      assertNoExternalWireChange([
        ...PAH0_COMPATIBILITY_TABLE,
        {
          area: "platform new resource supply",
          owner: "platform" as const,
          current: "x",
          harness_expectation: "y",
          action: "contract-first" as const,
          external_change_required: true,
        },
      ]),
    ).toThrow("EXTERNAL_WIRE_CHANGE_REQUIRED");
    expect(decideContractOwner("specs/workflow.schema.json").owner).toBe(
      "workspace-spec",
    );
    expect(() => decideContractOwner("totally-unknown-area-xyz")).toThrow(
      "NEEDS_CONTRACT_REVIEW",
    );
  });

  it("records_the_preview_tool_scoping_repro_with_negative_cases", () => {
    const reproduced = summarizePreviewInputRepro({
      request_id: "request-abcdefghijklmnop",
      workflow_selected: true,
      offered_tools: ["propose_report_scope"],
      input_tool_offered: false,
      actual_input_observed: true,
      outcome: "",
      cause: "",
    });
    expect(reproduced.outcome).toBe("REPRODUCED");
    expect(reproduced.cause).toContain("WORKFLOW_STEP_TOOL_SCOPING");
    expect(
      summarizePreviewInputRepro({
        request_id: "request-abcdefghijklmnop",
        workflow_selected: false,
        offered_tools: ["propose_set_text"],
        input_tool_offered: true,
        actual_input_observed: true,
        outcome: "",
        cause: "",
      }).outcome,
    ).toBe("RECORDED");
  });
});
