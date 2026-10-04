import { describe, expect, it } from "vitest";
import {
  composeBootstrapEnvelope,
  isExecutionTarget,
  sanitiseOriginPath,
} from "../../../src/page-act-harness/bootstrap-composer.js";
import {
  assertCapabilityToolAgreement,
  guardAskReadOnly,
  guardActScriptConsent,
  listActReadTools,
} from "../../../src/page-act-harness/capability-check.js";

// PAH-1 contract/unit scope: bootstrap composition + capability agreement.
// Model relevance judgement is not proven here (§12).
const base = () => ({
  request_id: "request-abcdefghijklmnop",
  request_revision: 1,
  mode: "act" as const,
  text: "Search query에 browser test를 입력해줘.",
  document_epoch: "epoch-abcdefghijklmnop",
  page_scope_epoch: "scope-abcdefghijklmnop",
  nodes: [
    { role: "textbox", name: "Search query", visible: true, enabled: true },
    { role: "button", name: "Preview", visible: true, enabled: true },
  ],
  read_tools: [
    "read_page",
    "get_page_text",
    "find",
    "read_semantic_projection",
  ],
  propose_tools: ["propose_set_text"],
  script_read: "CONSENT_REQUIRED" as const,
  inventory_id: "inventory-abcdefghijklm",
  observation_evidence_id: "ev-ui-abcdefghijklmnop",
});

describe("PAH-1 bootstrap and capabilities", () => {
  it("composes_a_first_context_for_a_plain_page_without_a_declaration", () => {
    const envelope = composeBootstrapEnvelope(base());
    expect(envelope.request.text).toContain("Search query");
    expect(
      envelope.observation.controls.map((control) => control.name),
    ).toContain("Search query");
    expect(envelope.observation.coverage.complete).toBe(false);
    expect(envelope.workflow_inventory.state).toBe("NOT_READ");
  });

  it("marks_help_outside_the_projection_as_not_read_with_a_followup_cursor", () => {
    const envelope = composeBootstrapEnvelope({
      ...base(),
      nodes: Array.from({ length: 25 }, (_, index) => ({
        role: "textbox",
        name: `field-${index}`,
        visible: true,
        enabled: true,
      })),
    });
    expect(envelope.omitted ?? []).toContain("page-description:NOT_READ");
    expect(envelope.resources.next_cursor).toBe("cursor-controls-1");
    expect(envelope.observation.controls.length).toBe(20);
  });

  it("distinguishes_absent_undiscovered_and_unsupported_material", () => {
    const envelope = composeBootstrapEnvelope({
      ...base(),
      nodes: [
        { role: "textbox", name: "Search query", visible: true, enabled: true },
        { role: "textbox", name: "hidden help", visible: false, enabled: true },
        { role: "button", name: "off", visible: true, enabled: false },
      ],
      unsupported: [{ name: "read_component_data", reason: "PAH-4_PENDING" }],
    });
    expect(envelope.omitted ?? []).toContain("hidden-nodes:1");
    expect(envelope.omitted ?? []).toContain("disabled-nodes:1");
    // Absent description is NOT_READ (undiscovered), never a fabricated item.
    expect(envelope.resources.items.length).toBe(0);
    expect(
      envelope.observation.controls.some((c) => c.name === "hidden help"),
    ).toBe(false);
    expect(envelope.unsupported_capabilities).toEqual([
      { name: "read_component_data", reason: "PAH-4_PENDING" },
    ]);
    expect(
      assertCapabilityToolAgreement(
        envelope.capabilities,
        [
          ...envelope.capabilities.read.map((name) => ({ name })),
          ...envelope.capabilities.propose.map((name) => ({ name })),
        ],
        [{ name: "read_component_data", reason: "PAH-4_PENDING" }],
      ).read,
    ).toContain("read_page");
  });

  it("rejects_ask_bootstrap_carrying_propose_tools", () => {
    expect(() =>
      composeBootstrapEnvelope({
        ...base(),
        mode: "ask",
        propose_tools: ["propose_set_text"],
      }),
    ).toThrow("ASK_MUTATION_LEAK");
  });

  it("blocks_password_role_even_without_an_explicit_sensitive_flag", () => {
    expect(
      isExecutionTarget({
        role: "password",
        name: "pw",
        visible: true,
        enabled: true,
      }),
    ).toBe(false);
    const envelope = composeBootstrapEnvelope({
      ...base(),
      nodes: [
        {
          role: "password",
          name: "pw",
          visible: true,
          enabled: true,
        },
      ],
    });
    expect(envelope.observation.controls.length).toBe(0);
    expect(envelope.omitted ?? []).toContain("sensitive-nodes:1");
  });

  it("never_confuses_hidden_disabled_or_password_nodes_with_targets", () => {
    expect(
      isExecutionTarget({
        role: "textbox",
        name: "a",
        visible: false,
        enabled: true,
      }),
    ).toBe(false);
    expect(
      isExecutionTarget({
        role: "button",
        name: "b",
        visible: true,
        enabled: false,
      }),
    ).toBe(false);
    expect(
      isExecutionTarget({
        role: "password",
        name: "pw",
        visible: true,
        enabled: true,
        sensitive: true,
      }),
    ).toBe(false);
    expect(sanitiseOriginPath("https://a.test/x?token=1#f", "/p?y=2")).toBe(
      "https://a.test/x/p",
    );
    expect(sanitiseOriginPath("https://user:pass@a.test/x", "/p")).toBe(
      "https://a.test/x/p",
    );
  });

  it("rejects_capability_schema_drift_and_ask_mutation_leak", () => {
    expect(() =>
      assertCapabilityToolAgreement(
        { read: ["read_page"], propose: [], script_read: "CONSENT_REQUIRED" },
        [],
      ),
    ).toThrow("CAPABILITY_WITHOUT_SCHEMA");
    expect(() =>
      assertCapabilityToolAgreement(
        { read: ["read_page"], propose: [], script_read: "CONSENT_REQUIRED" },
        [{ name: "read_page" }, { name: "propose_set_text" }],
      ),
    ).toThrow("SCHEMA_WITHOUT_CAPABILITY");
    expect(() =>
      assertCapabilityToolAgreement(
        {
          read: ["read_page"],
          propose: ["read_page"],
          script_read: "CONSENT_REQUIRED",
        },
        [{ name: "read_page" }],
      ),
    ).toThrow("CAPABILITY_OVERLAP");
    expect(() => guardAskReadOnly(["read_page", "propose_set_text"])).toThrow(
      "ASK_MUTATION_LEAK",
    );
    expect(() => guardAskReadOnly(["read_page", "submit_plan"])).toThrow(
      "ASK_MUTATION_LEAK",
    );
    guardAskReadOnly(["read_page", "find"]);
    expect(listActReadTools()).toContain("read_semantic_projection");
    expect(() => guardActScriptConsent("CONSENT_REQUIRED", true)).toThrow(
      "SCRIPT_CONSENT_REQUIRED",
    );
    expect(() => guardActScriptConsent("UNSUPPORTED", true)).toThrow(
      "SCRIPT_UNSUPPORTED",
    );
  });
});
