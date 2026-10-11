import { describe, expect, it } from "vitest";
import { validActCompletion } from "../../../src/contracts/act-completion.js";
import { validateChatEvent } from "../../../src/contracts/chat-events.js";
import { actCompletionView } from "../../../src/sidepanel/act-completion-view.js";
import { TabChatSessionStore } from "../../../src/state/tab-chat-session-store.js";
import { RequestPersistence } from "../../../src/service-worker/request-persistence.js";
import { ChatRequestLifecycle } from "../../../src/service-worker/chat-request-lifecycle.js";
import { makeS17Test } from "./s17-test-support.js";

describe("Provider completion recovery and presentation", () => {
  it.each(["UNKNOWN", "FAILED"] as const)(
    "restores completed display alongside local %s evidence",
    async (outcome) => {
      const completion = {
        action_outcome: outcome,
        goal_status: "completed" as const,
        reason: "PROVIDER_COMPLETED" as const,
        reassessments: 0,
      };
      expect(validActCompletion(completion)).toBe(true);
      const store = new TabChatSessionStore();
      const { active, dependencies } = makeS17Test();
      store.bindRun("run-abcdefghijklmnop", 1, dependencies.pageScope(active));
      const event = store.append("run-abcdefghijklmnop", {
        type: "run_terminal",
        outcome: "VERIFIED",
        completion,
      });
      expect(validateChatEvent(event)).toEqual(event);
      const restored = new TabChatSessionStore();
      restored.restore(store.snapshot());
      expect(restored.recoverable(1)[0]).toMatchObject({ completion });
      expect(actCompletionView(completion)).toEqual({
        message: "요청한 목표의 완료를 확인했습니다.",
        active: false,
      });
      expect(
        validActCompletion({ ...completion, goal_status: "checking" }),
      ).toBe(false);

      let saved: Record<string, unknown> = {};
      const persistence = new RequestPersistence({
        get: async () => saved,
        set: async (value) => {
          saved = value;
        },
      });
      const input = {
        request_id: "d9b6c2a2-aeb6-43a6-8baa-f679bceac2a1",
        tab_id: 1,
        prompt: "Private prompt",
        mode: "act" as const,
        owner: "owner",
      };
      const requests = new ChatRequestLifecycle(undefined, persistence);
      requests.start(input);
      const generation = requests.startRun(input.request_id)!;
      requests.settled(input.request_id, generation, {
        ok: true,
        outcome: "VERIFIED",
        completion,
      });
      await requests.flush();
      const recovered = new ChatRequestLifecycle(undefined, persistence);
      await recovered.restore();
      const status = recovered.status(input.request_id, 1, input.owner);
      expect(status).toMatchObject({
        state: "TERMINAL",
        outcome: "VERIFIED",
        completion,
      });
      expect(status?.code).toBeUndefined();
      expect(actCompletionView(status?.completion)).toEqual(
        actCompletionView(completion),
      );
      expect(JSON.stringify(saved)).not.toContain("Private prompt");
    },
  );
});
