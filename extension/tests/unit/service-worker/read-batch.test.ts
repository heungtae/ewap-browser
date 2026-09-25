import { describe, expect, it, vi } from "vitest";
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
  it("validates every item before reading the first one", () => {
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      expect(() =>
        executeReadBatch(snapshot, [
          { tool: "read_page", arguments: {} },
          { tool: "find", arguments: { query: "Save", extra: true } },
        ]),
      ).toThrow("INVALID_ARGUMENT");
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
  });
  it("rejects unknown fields and invalid nested bounds", () => {
    expect(() =>
      executeReadBatch(snapshot, [
        { tool: "read_page", arguments: { scope: "all_dom", extra: true } },
      ]),
    ).toThrow("INVALID_ARGUMENT");
    expect(() =>
      executeReadBatch(snapshot, [
        { tool: "read_page", arguments: { depth: 1 } },
      ]),
    ).toThrow("INVALID_ARGUMENT");
    expect(() =>
      executeReadBatch(snapshot, [{ tool: "read_batch", arguments: {} }]),
    ).toThrow("INVALID_ARGUMENT");
  });
  it("checks cancellation and the shared time budget", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() =>
      executeReadBatch(snapshot, [{ tool: "read_page", arguments: {} }], {
        signal: controller.signal,
      }),
    ).toThrow("POLICY_DENIED");
    let time = 0;
    expect(() =>
      executeReadBatch(snapshot, [{ tool: "read_page", arguments: {} }], {
        now: () => (time++ === 0 ? 0 : 30_001),
      }),
    ).toThrow("REQUEST_TIMEOUT");
  });
});
