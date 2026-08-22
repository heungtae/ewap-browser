import { describe, expect, it } from "vitest";
import { executeReadBatch } from "../../../src/service-worker/read-batch.js";

const snapshot = {
  document_epoch: "epoch-abcdefghijklmnop",
  frame_id: 0,
  nodes: [
    {
      model_ref: "ref-abcdefghijklmnop",
      role: "button" as const,
      name: "Save",
      state: {},
      visible: true,
      enabled: true,
    },
  ],
  visible_text: "Article body for read batch",
};

describe("read batch", () => {
  it("runs only bounded read tools in input order", () => {
    expect(
      executeReadBatch(snapshot, [
        { tool: "find", arguments: { query: "save" } },
        { tool: "get_page_text", arguments: {} },
      ]),
    ).toEqual([
      expect.objectContaining({ tool: "find" }),
      expect.objectContaining({ tool: "get_page_text" }),
    ]);
  });
  it("rejects mutation or nested-batch shaped input before execution", () => {
    expect(() =>
      executeReadBatch(snapshot, [
        { tool: "click_by_ref", arguments: { target: "ref" } } as never,
      ]),
    ).toThrow("INVALID_ARGUMENT");
  });
});
