import { describe, expect, it } from "vitest";
import {
  labelCategory,
  semanticFingerprint,
} from "../../../src/profile/fingerprint.js";
describe("semantic fingerprint", () => {
  it("given_golden_projection_when_hashed_then_matches_contract", () => {
    const result = semanticFingerprint({
      document_epoch: "x",
      frame_id: 0,
      visible_text: "Current page text is not part of the fingerprint.",
      nodes: [
        {
          ref_id: "a",
          role: "main",
          name: "record 123",
          state: {},
          visible: true,
          enabled: true,
        },
        {
          ref_id: "b",
          role: "textbox",
          name: "record",
          state: { required: true },
          visible: true,
          enabled: true,
          parent_ref_id: "a",
        },
        {
          ref_id: "c",
          role: "button",
          name: "Save",
          state: {},
          visible: true,
          enabled: true,
          parent_ref_id: "a",
        },
      ],
    });
    expect(Buffer.byteLength(result.canonical)).toBe(665);
    expect(result.fingerprint).toBe(
      "hZ-9mp5UG9qpRc0_nh7yIYYW5WYDkALXQ1XUeqSQuus",
    );
  });
  it("given_save_aliases_when_classifying_then_same_category", () => {
    expect(labelCategory("SAVE!")).toBe("save");
    expect(labelCategory("저장")).toBe("save");
  });
});
