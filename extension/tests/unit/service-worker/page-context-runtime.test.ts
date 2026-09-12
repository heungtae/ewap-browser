import { describe, expect, it, vi } from "vitest";
import { createPageContextRuntime } from "../../../src/service-worker/page-context-runtime.js";

describe("page context runtime", () => {
  it("reads_a_newly_registered_document_even_if_a_late_url_event_left_a_stale_mark", async () => {
    const sendMessage = vi.fn(async () => ({
      ok: true,
      snapshot: {
        origin: "https://code.visualstudio.com",
        snapshot: {
          schema_version: 2,
          document_epoch: "epoch-abcdefghijklmnop",
          frame_id: 0,
          nodes: [],
          visible_text: "Remote Development using SSH",
        },
      },
    }));
    const runtime = createPageContextRuntime({
      chrome: {
        tabs: {
          query: async () => [
            { id: 7, url: "https://code.visualstudio.com/docs/remote/ssh" },
          ],
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
    expect(sendMessage).toHaveBeenCalledOnce();
  });
});
