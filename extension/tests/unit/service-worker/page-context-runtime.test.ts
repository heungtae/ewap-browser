import { describe, expect, it, vi } from "vitest";
import { createPageContextRuntime } from "../../../src/service-worker/page-context-runtime.js";

describe("page context runtime", () => {
  it("reads_a_newly_registered_document_even_if_a_late_url_event_left_a_stale_mark", async () => {
    const sendMessage = vi.fn(
      async (_tab: number, message: { part: string }) => ({
        ok: true,
        binding: {
          document_epoch: "epoch-abcdefghijklmnop",
          page_scope_epoch: "scope-abcdefghijklmnop",
          url: "https://code.visualstudio.com/docs/remote/ssh",
        },
        ...(message.part === "document"
          ? { origin: "https://code.visualstudio.com" }
          : {}),
        ...(message.part === "nodes" ? { nodes: [], truncated: false } : {}),
        ...(["visible_text", "article_text"].includes(message.part)
          ? { text: "Destination" }
          : {}),
      }),
    );
    const runtime = createPageContextRuntime({
      chrome: {
        tabs: {
          query: async () => [
            { id: 7, url: "https://code.visualstudio.com/docs/remote/ssh" },
          ],
          get: async () => ({
            id: 7,
            url: "https://code.visualstudio.com/docs/remote/ssh",
          }),
          sendMessage,
        },
      } as never,
      defaultScope: () => "all_dom",
      isRegistered: () => true,
      pageOrigin: (url) => new URL(url!).origin,
      recovery: { recover: async () => true } as never,
      scopeFor: () => "scope-abcdefghijklmnop",
    });

    await expect(runtime.read()).resolves.toMatchObject({
      tabId: 7,
      path: "/docs/remote/ssh",
      snapshot: { document_epoch: "epoch-abcdefghijklmnop" },
    });
    expect(sendMessage).toHaveBeenCalledTimes(5);
  });
});
