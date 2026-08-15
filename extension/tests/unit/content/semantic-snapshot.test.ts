import { describe, expect, it } from "vitest";
import { validateSemanticSnapshot } from "../../../src/contracts/semantic-snapshot.js";

const snapshot = {
  document_epoch: "abcdefghijklmnop",
  frame_id: 0,
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
    expect(validateSemanticSnapshot(snapshot).nodes[0]?.name).toBe("Save"));
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
});
