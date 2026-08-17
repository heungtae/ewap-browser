import { describe, expect, it } from "vitest";
import { validateSemanticSnapshot } from "../../../src/contracts/semantic-snapshot.js";

const snapshot = {
  document_epoch: "abcdefghijklmnop",
  frame_id: 0,
  visible_text: "Google translation result",
  nodes: [
    {
      ref_id: "qrstuvwxyzABCDEF",
      role: "button",
      name: "Save",
      state: {},
      visible: true,
      enabled: true,
    },
  ],
};
describe("semantic snapshot contract", () => {
  it("given_closed_snapshot_when_validating_then_accepts_projection", () =>
    expect(validateSemanticSnapshot(snapshot)).toMatchObject({
      visible_text: "Google translation result",
      nodes: [{ name: "Save" }],
    }));
  it("given_raw_value_or_unknown_key_when_validating_then_denies", () =>
    expect(() =>
      validateSemanticSnapshot({
        ...snapshot,
        nodes: [{ ...snapshot.nodes[0], value: "secret" }],
      }),
    ).toThrow("INVALID_ARGUMENT"));
  it("given_self_relation_when_validating_then_denies", () =>
    expect(() =>
      validateSemanticSnapshot({
        ...snapshot,
        nodes: [{ ...snapshot.nodes[0], parent_ref_id: "qrstuvwxyzABCDEF" }],
      }),
    ).toThrow("INVALID_ARGUMENT"));
  it("given_oversized_visible_text_when_validating_then_denies", () =>
    expect(() =>
      validateSemanticSnapshot({
        ...snapshot,
        visible_text: "x".repeat(12_001),
      }),
    ).toThrow("INVALID_ARGUMENT"));
});
