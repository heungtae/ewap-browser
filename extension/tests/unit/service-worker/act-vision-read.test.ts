import { describe, expect, it, vi } from "vitest";
import {
  approvedVisionRead,
  visionReadMessages,
} from "../../../src/service-worker/act-vision-read.js";
import { openAiCompatibleAdapter } from "../../../src/providers/openai-compatible.js";
import type { BrowserTabs } from "../../../src/service-worker/browser-api.js";
const id = "component-abcdefghijklmnop";
describe("S19 approved vision transport", () => {
  it("does not capture before consent or after a sensitive/stale recheck", async () => {
    let safe = true;
    const execute = vi.fn(async () => ({
      data_url: "data:image/png;base64,YQ==",
    }));
    const options = {
      tabs: {
        sendMessage: async () => ({ safe, document_epoch: "epoch" }),
      } as unknown as BrowserTabs,
      tabId: 1,
      documentEpoch: "epoch",
      requestRevision: 1,
      current: () => true,
      enabled: () => true,
      consent: async () => false,
    };
    expect(await approvedVisionRead(options, execute)).toMatchObject({
      status: "DENIED",
    });
    expect(execute).not.toHaveBeenCalled();
    expect(
      await approvedVisionRead(
        {
          ...options,
          consent: async () => {
            safe = false;
            return true;
          },
        },
        execute,
      ),
    ).toMatchObject({ status: "CANCELLED" });
    expect(execute).not.toHaveBeenCalled();
  });
  it.each(["chat_completions", "responses"] as const)(
    "sends approved vision as typed image content for %s",
    (wire) => {
      const result = visionReadMessages("screenshot", {
        capture_id: id,
        mime_type: "image/png",
        data_url: "data:image/png;base64,YQ==",
      });
      expect(JSON.stringify(result.result)).not.toContain("base64");
      const plan = openAiCompatibleAdapter.plan({
        wire_api: wire,
        model: "fixture",
        messages: [result.image!],
        stream: false,
      });
      expect(JSON.stringify(plan.body)).toContain(
        wire === "responses" ? "input_image" : "image_url",
      );
    },
  );
});
