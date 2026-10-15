import { afterEach, describe, expect, it, vi } from "vitest";
import { readPageSnapshotParts } from "../../../src/service-worker/page-snapshot-reader.js";
import type { BrowserTabs } from "../../../src/service-worker/browser-api.js";
const binding = {
  document_epoch: "epoch",
  page_scope_epoch: "scope",
  url: "https://fixture.test",
};
const result = (part: string) => ({
  ok: true,
  binding,
  ...(part === "document" ? { origin: "https://fixture.test" } : {}),
  ...(part === "nodes" ? { nodes: [], truncated: false } : {}),
  ...(part === "workflow" ? { workflow: undefined } : {}),
  ...(["visible_text", "article_text"].includes(part) ? { text: part } : {}),
});
afterEach(() => vi.useRealTimers());
describe("ISS-20261012-005 per-item snapshot budget", () => {
  it("allows a 40-second aggregate when every item finishes within 10 seconds and reports each item", async () => {
    vi.useFakeTimers();
    const progress = vi.fn();
    const tabs = {
      sendMessage: vi.fn(async (_id, message) => {
        await new Promise((resolve) => setTimeout(resolve, 8_000));
        return result(message.part);
      }),
    } as unknown as BrowserTabs;
    const read = readPageSnapshotParts(tabs, 7, "interactive", progress);
    const assertion = expect(read).resolves.toMatchObject({
      snapshot: {
        snapshot: {
          nodes: [],
          visible_text: "visible_text",
          article_text: "article_text",
        },
      },
    });
    await vi.advanceTimersByTimeAsync(40_000);
    await assertion;
    expect(progress.mock.calls.map((call) => call[1])).toEqual([
      "document",
      "nodes",
      "workflow",
      "visible_text",
      "article_text",
    ]);
  });
  it("fails the slow item without starting later items", async () => {
    vi.useFakeTimers();
    const sendMessage = vi.fn(async (_id, message) => {
      if (message.part === "nodes") await new Promise(() => undefined);
      return result(message.part);
    });
    const read = readPageSnapshotParts(
      { sendMessage } as unknown as BrowserTabs,
      7,
      "all_dom",
    );
    const assertion = expect(read).rejects.toMatchObject({
      code: "PAGE_SNAPSHOT_TIMEOUT",
      detail: "snapshot_part:nodes",
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
  it("rejects changed binding without collecting remaining items", async () => {
    const sendMessage = vi.fn(async (_id, message) => ({
      ...result(message.part),
      binding: {
        ...binding,
        page_scope_epoch: message.part === "nodes" ? "changed" : "scope",
      },
    }));
    await expect(
      readPageSnapshotParts(
        { sendMessage } as unknown as BrowserTabs,
        7,
        "all_dom",
      ),
    ).rejects.toMatchObject({ code: "PAGE_SCOPE_STALE" });
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });
});
