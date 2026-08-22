import { describe, expect, it } from "vitest";
import {
  findPage,
  getPageText,
  readPage,
} from "../../../src/service-worker/page-read.js";

const snapshot = {
  schema_version: 2 as const,
  document_epoch: "epoch-abcdefghijklmnop",
  frame_id: 0,
  nodes: [
    {
      model_ref: "visible-ref-abcdefghijklmnop",
      role: "button" as const,
      name: "Save report",
      state: {},
      visible: true,
      enabled: true,
      visibility: "visible" as const,
    },
    {
      model_ref: "hidden-ref-abcdefghijklmnop",
      role: "dialog" as const,
      name: "Advanced secret-free options",
      state: {},
      visible: false,
      enabled: true,
      visibility: "hidden" as const,
      hidden_reason: "display_none" as const,
    },
  ],
  visible_text: "Visible article body",
};

describe("page read", () => {
  it("defaults to all-dom while retaining hidden visibility metadata", () => {
    const result = readPage(snapshot);
    expect(result.scope).toBe("all_dom");
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[1]).toMatchObject({
      visible: false,
      hidden_reason: "display_none",
    });
  });
  it("keeps page text visible-only and deterministic find marks hidden matches", () => {
    expect(getPageText(snapshot).text).toBe("Visible article body");
    expect(findPage(snapshot, "advanced")).toEqual([
      expect.objectContaining({
        model_ref: "hidden-ref-abcdefghijklmnop",
        visible: false,
      }),
    ]);
  });
  it("prefers normalized article text and rejects pages without readable text", () => {
    expect(
      getPageText({
        ...snapshot,
        visible_text: "Navigation copy that should not win",
        article_text: "Article body\nwith normalized content",
      }).text,
    ).toBe("Article body\nwith normalized content");
    expect(() =>
      getPageText({ ...snapshot, visible_text: "short", article_text: "" }),
    ).toThrow("PAGE_TEXT_UNAVAILABLE");
  });
  it("bounds a focused subtree by the closed depth argument", () => {
    const tree = {
      ...snapshot,
      nodes: [
        {
          ...snapshot.nodes[0],
          model_ref: "root-ref-abcdefghijklmnop",
        },
        {
          ...snapshot.nodes[0],
          model_ref: "child-ref-abcdefghijklmnop",
          parent_model_ref: "root-ref-abcdefghijklmnop",
        },
        {
          ...snapshot.nodes[0],
          model_ref: "grandchild-ref-abcdefghijkl",
          parent_model_ref: "child-ref-abcdefghijklmnop",
        },
      ],
    };
    expect(
      readPage(tree, {
        parent_model_ref: "root-ref-abcdefghijklmnop",
        depth: 1,
      }).nodes.map((node) => node.model_ref),
    ).toEqual(["root-ref-abcdefghijklmnop", "child-ref-abcdefghijklmnop"]);
    expect(() => readPage(tree, { depth: 1 })).toThrow("INVALID_ARGUMENT");
  });
});
