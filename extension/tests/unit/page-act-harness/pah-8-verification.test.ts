import { describe, expect, it } from "vitest";
import {
  REQUIRED_SCENARIOS,
  checkReleaseGate,
  defineHoldoutPage,
  recordScenario,
  summarizeMatrix,
} from "../../../src/page-act-harness/verification-matrix.js";
import { composeBootstrapEnvelope } from "../../../src/page-act-harness/bootstrap-composer.js";

// PAH-8 unit slice: matrix bookkeeping, holdout generics, and release
// gating. Live provider + Chrome holdout runs remain NOT_VERIFIED (§12).
describe("PAH-8 verification matrix and release gate", () => {
  it("records_12_scenario_ids_and_preserves_a_live_failure", () => {
    expect(REQUIRED_SCENARIOS.length).toBe(12);
    const record = recordScenario({
      scenario: "preview-selected-for-search",
      control: "PASS",
      live: "FAIL",
      note: "control pass kept; scenario stays failing until live passes",
    });
    expect(record.overall).toBe("FAIL");
    const summary = summarizeMatrix([
      record,
      recordScenario({
        scenario: "answer-without-tools",
        control: "PASS",
        live: "NOT_VERIFIED",
        note: "live Chrome run pending",
      }),
    ]);
    expect(summary).toEqual({ total: 2, pass: 0, fail: 1, not_verified: 1 });
  });

  it("smokes_label_passthrough_for_a_holdout_variant", () => {
    const holdout = defineHoldoutPage({
      label_variant: "Find box",
      dom_variant: "renamed-roles",
      script_variant: "relocated-bundle",
      component_variant: "grid+svg",
      per_page_product_code: false,
    });
    expect(holdout.per_page_product_code).toBe(false);
    // The generic bootstrap path does not branch on label text.
    const envelope = composeBootstrapEnvelope({
      request_id: "request-abcdefghijklmnop",
      request_revision: 1,
      mode: "act",
      text: "Find box에 hello를 입력해줘.",
      document_epoch: "epoch-abcdefghijklmnop",
      page_scope_epoch: "scope-abcdefghijklmnop",
      nodes: [
        { role: "textbox", name: "Find box", visible: true, enabled: true },
      ],
      read_tools: ["read_page"],
      propose_tools: ["propose_set_text"],
      script_read: "CONSENT_REQUIRED",
      inventory_id: "inventory-abcdefghijklm",
      observation_evidence_id: "ev-ui-abcdefghijklmnop",
    });
    expect(envelope.observation.controls[0]?.name).toBe("Find box");
    expect(() =>
      defineHoldoutPage({
        label_variant: "",
        dom_variant: "y",
        script_variant: "z",
        component_variant: "w",
        per_page_product_code: false,
      }),
    ).toThrow("HOLDOUT_VARIANT_EMPTY");
  });

  it("smokes_release_gate_separation_for_live_and_approval", () => {
    const gate = checkReleaseGate({
      build_ok: true,
      chrome_runtime_ok: true,
      live_reasoning_ok: false,
      compat_ok: true,
      release_approved: false,
    });
    expect(gate.shippable).toBe(false);
    expect(gate.reasons).toContain("LIVE_REASONING_UNVERIFIED");
    expect(gate.reasons).toContain("RELEASE_NOT_APPROVED");
    expect(
      checkReleaseGate({
        build_ok: true,
        chrome_runtime_ok: true,
        live_reasoning_ok: true,
        compat_ok: true,
        release_approved: true,
      }).shippable,
    ).toBe(true);
  });
});
