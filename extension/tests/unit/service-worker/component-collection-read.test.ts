import { describe, expect, it, vi } from "vitest";
import type { BrowserTabs } from "../../../src/service-worker/browser-api.js";
import { readApprovedComponentCollection } from "../../../src/service-worker/component-collection-read.js";
import { validateChatEvent } from "../../../src/contracts/chat-events.js";
describe("S19 collection approval boundary", () => {
  it("denies before DOM access when policy or user refuses", async () => {
    const sendMessage = vi.fn();
    const options = {
      tabs: { sendMessage } as unknown as BrowserTabs,
      tabId: 1,
      documentEpoch: "epoch",
      requestRevision: 1,
      runId: "run",
      current: () => true,
      allowCollection: () => false,
      consent: async () => true,
    };
    expect(await readApprovedComponentCollection(options, {})).toMatchObject({
      status: "DENIED",
      code: "COLLECTION_POLICY_DENIED",
    });
    expect(
      await readApprovedComponentCollection(
        { ...options, allowCollection: () => true, consent: async () => false },
        {},
      ),
    ).toMatchObject({ status: "DENIED" });
    expect(sendMessage).not.toHaveBeenCalled();
  });
  it("does not dispatch a cancelled request after approval", async () => {
    const controller = new AbortController(),
      sendMessage = vi.fn();
    expect(
      await readApprovedComponentCollection(
        {
          tabs: { sendMessage } as unknown as BrowserTabs,
          tabId: 1,
          documentEpoch: "epoch",
          requestRevision: 1,
          runId: "run",
          current: () => true,
          allowCollection: () => true,
          signal: controller.signal,
          consent: async () => {
            controller.abort();
            return true;
          },
        },
        {},
      ),
    ).toMatchObject({ status: "CANCELLED" });
    expect(sendMessage).not.toHaveBeenCalled();
  });
  it.each(["component-scroll", "component-vision"] as const)(
    "accepts the closed %s event through the actual event validator",
    (purpose) => {
      expect(
        validateChatEvent({
          type: "source_consent_required",
          session_id: "session-abcdefghijkl",
          thread_id: "thread-abcdefghijkl",
          tab_id: 1,
          run_id: "run-abcdefghijklmnop",
          sequence: 1,
          request_id: "request-abcdefghijkl",
          resource_count: 1,
          host: "fixture.test",
          purpose,
        }),
      ).toMatchObject({ purpose });
    },
  );
});
