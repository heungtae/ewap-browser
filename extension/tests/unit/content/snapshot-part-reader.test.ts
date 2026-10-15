import { describe, expect, it, vi } from "vitest";
import { createSnapshotPartReader } from "../../../src/content/snapshot-part-reader.js";
const setup = () => {
  const binding = { document_epoch: "epoch", page_scope_epoch: "scope" };
  const dependencies = {
    binding: () => binding,
    url: () => "https://fixture.test",
    origin: () => "https://fixture.test",
    prepare: vi.fn(async () => true),
    nodes: vi.fn(() => ({ nodes: [], truncated: false })),
    workflow: vi.fn(),
    visibleText: vi.fn(() => "body"),
    articleText: vi.fn(() => "article"),
  };
  return {
    dependencies,
    read: createSnapshotPartReader(dependencies),
    binding: { ...binding, url: "https://fixture.test" },
  };
};
describe("staged content snapshot", () => {
  it("only runs the requested collector", async () => {
    const { read, dependencies, binding } = setup();
    await expect(
      read({ part: "visible_text", scope: "interactive", binding }),
    ).resolves.toMatchObject({ ok: true, text: "body" });
    expect(dependencies.visibleText).toHaveBeenCalledOnce();
    expect(dependencies.nodes).not.toHaveBeenCalled();
    expect(dependencies.articleText).not.toHaveBeenCalled();
  });
  it("rejects stale document and URL before reading", async () => {
    const { read, dependencies, binding } = setup();
    for (const stale of [
      { ...binding, document_epoch: "other" },
      { ...binding, url: "https://other.test" },
    ])
      await expect(
        read({ part: "nodes", scope: "all_dom", binding: stale }),
      ).resolves.toMatchObject({ code: "PAGE_SCOPE_STALE" });
    expect(dependencies.nodes).not.toHaveBeenCalled();
  });
});
