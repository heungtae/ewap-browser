import { describe, expect, it } from "vitest";
import {
  EXECUTOR_TO_PROPOSE,
  assertHarnessSubsetOffered,
  composeActEntryEnvelope,
  findUnjustifiedDrops,
  proposeNamesFor,
  toHarnessRevision,
} from "../../../src/page-act-harness/act-entry-bridge.js";

// Entry-wiring contract slice: snapshot mapping (incl. password
// sensitivity), executor->propose mapping, and the no-narrowing gate.
describe("page-act-harness entry bridge", () => {
  it("maps_snapshot_nodes_and_marks_passwords_sensitive", () => {
    const { envelope, propose_tools, entry_roles } = composeActEntryEnvelope({
      request_id: "request-abcdefghijklmnop",
      request_revision: 1,
      mode: "act",
      text: "Search query에 browser test를 입력해줘.",
      document_epoch: "epoch-abcdefghijklmnop",
      page_scope_epoch: "scope-abcdefghijklmnop",
      origin: "https://app.test",
      path: "/items",
      nodes: [
        { role: "textbox", name: "Search query", visible: true, enabled: true },
        { role: "password", name: "pw", visible: true, enabled: true },
      ],
      definition_tools: ["set_text_by_ref", "click_by_ref"],
      inventory_id: "inventory-abcdefghijklm",
      observation_evidence_id: "ev-ui-abcdefghijklmnop",
      script_read: "CONSENT_REQUIRED",
    });
    expect(propose_tools).toEqual(["propose_set_text", "propose_click"]);
    expect(entry_roles).toEqual(["textbox"]);
    expect(envelope.observation.controls.map((c) => c.name)).toEqual([
      "Search query",
    ]);
    expect(envelope.omitted ?? []).toContain("sensitive-nodes:1");
  });

  it("maps_every_known_executor_tool_to_its_propose_schema", () => {
    expect(
      proposeNamesFor([
        "click_by_ref",
        "navigate",
        "set_text_by_ref",
        "select_option_by_ref",
        "set_checked_by_ref",
        "press_key_by_ref",
        "unknown_future_tool",
      ]),
    ).toEqual([
      "propose_click",
      "propose_navigate",
      "propose_set_text",
      "propose_select_option",
      "propose_set_checked",
      "propose_press_key",
    ]);
  });

  it("fails_loudly_when_a_declared_tool_is_narrowed_away", () => {
    assertHarnessSubsetOffered(
      ["propose_set_text", "propose_click"],
      [{ name: "propose_set_text" }, { name: "propose_click" }],
    );
    expect(() =>
      assertHarnessSubsetOffered(
        ["propose_set_text"],
        [{ name: "propose_click" }],
      ),
    ).toThrow("HARNESS_TOOL_NARROWING");
  });

  it("distinguishes_bug_narrowing_from_targets_lost_to_a_page_change", () => {
    const visibleTextbox = [{ role: "textbox", visible: true, enabled: true }];
    expect(
      findUnjustifiedDrops(
        ["propose_set_text", "propose_click"],
        [{ name: "propose_click" }],
        visibleTextbox,
      ),
    ).toEqual(["propose_set_text"]);
    // Targets gone from the fresh snapshot: legitimate narrowing, no fail.
    expect(
      findUnjustifiedDrops(
        ["propose_set_text", "propose_click"],
        [{ name: "propose_click" }],
        [{ role: "button", visible: true, enabled: true }],
      ),
    ).toEqual([]);
    // Hidden/disabled targets do not justify keeping the tool either.
    expect(
      findUnjustifiedDrops(
        ["propose_set_text"],
        [],
        [{ role: "textbox", visible: false, enabled: true }],
      ),
    ).toEqual([]);
  });

  it("normalizes_product_generation_zero_to_harness_revision_one", () => {
    expect(toHarnessRevision(undefined)).toBe(1);
    expect(toHarnessRevision(0)).toBe(1);
    expect(toHarnessRevision(-2)).toBe(1);
    expect(toHarnessRevision(1)).toBe(2);
    expect(toHarnessRevision(7)).toBe(8);
  });

  it("mirrors_every_executor_tool_with_a_propose_schema", () => {
    // service-worker/act-tools.ts genericActTools handles exactly these
    // executor tools; an unmapped tool would silently weaken the declared
    // set, so the mirror is pinned here.
    expect(Object.keys(EXECUTOR_TO_PROPOSE).sort()).toEqual(
      [
        "click_by_ref",
        "navigate",
        "press_key_by_ref",
        "select_option_by_ref",
        "set_checked_by_ref",
        "set_text_by_ref",
      ].sort(),
    );
  });
});
