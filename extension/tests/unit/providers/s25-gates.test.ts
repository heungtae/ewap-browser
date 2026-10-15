import { describe, expect, it, vi } from "vitest";
import { dual, json, nativeResponse, setup, task } from "./s25-support.js";
import { safeDecisionState } from "../../../src/providers/decision-state.js";
import { validateJevTask } from "../../../src/providers/jev-task-validation.js";
import { validateProviderActivity } from "../../../src/contracts/provider-activity.js";
import { acceptedChoice } from "../../../src/providers/jev-response.js";

describe("S25 decision gates", () => {
  it("confidence and selected probability are separate gates; reordered choices keep native identity", () => {
    const response = nativeResponse(task.questions);
    const answer = response.answers.verdict as {
      type: "choice";
      choice: string;
      confidence: number;
      probabilities: Record<string, number>;
    };
    answer.confidence = 0.4;
    expect(acceptedChoice(response as never, "verdict")).toBeUndefined();
    answer.confidence = 0.99;
    answer.probabilities = { read: 0.7, action: 0.3 };
    expect(acceptedChoice(response as never, "verdict")).toBeUndefined();
    answer.probabilities = { action: 0, read: 1 };
    expect(acceptedChoice(response as never, "verdict")).toBe("read");
  });
  it("excludes raw script/image/credential state without silently truncating permitted evidence", () => {
    const text = "x".repeat(18000);
    const value = safeDecisionState({
      script: "raw script",
      image_data_urls: ["data:image/png;base64,private"],
      nested: { password: "private-password", note: "Bearer abcdefghijklmnop" },
      original_request: text,
    });
    expect(JSON.stringify(value)).not.toMatch(
      /raw script|base64|private-password|abcdefghijklmnop/,
    );
    expect(value.original_request).toBe(text);
  });
  it("rejects unknown phase, empty questions and injected request keys before dispatch", () => {
    expect(() =>
      validateJevTask({ ...task, phase: "injected" as never }),
    ).toThrow("INVALID_ARGUMENT");
    expect(() => validateJevTask({ ...task, questions: {} })).toThrow(
      "INVALID_ARGUMENT",
    );
    expect(() =>
      validateJevTask({
        ...task,
        questions: {
          bad: {
            type: "choice",
            instructions: "Evaluate",
            criteria: { only: "one" },
          },
        },
      }),
    ).toThrow("INVALID_ARGUMENT");
  });
  it("keeps roles/stages/error categories closed, including configured stop", () => {
    expect(
      validateProviderActivity({
        provider_role: "decision",
        phase: "intent",
        stage: "STOPPED",
        code: "PROVIDER_UNAVAILABLE",
      }),
    ).toMatchObject({ stage: "STOPPED" });
    for (const changed of [
      { provider_role: "plugin" },
      { stage: "execute" },
      { phase: "raw_state" },
      { code: "private rejected input" },
    ])
      expect(() =>
        validateProviderActivity({
          provider_role: "decision",
          phase: "intent",
          stage: "DECIDING",
          ...changed,
        }),
      ).toThrow("INVALID_ARGUMENT");
  });
  it("dual chat buffers final primary text instead of publishing stream deltas", async () => {
    const { runtime } = setup(
      async () =>
        new Response(
          'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    await dual(runtime);
    const onDelta = vi.fn();
    expect(
      (
        await runtime.chat(
          { messages: [] },
          { signal: new AbortController().signal, onDelta },
        )
      ).content,
    ).toBe("hello");
    expect(onDelta).not.toHaveBeenCalled();
  });
  it.each(["routing", "evidence"])(
    "native low %s certainty delegates without asserting direct authority",
    async (gate) => {
      const questions = {
        ...task.questions,
        evidence_sufficient: {
          type: "noul" as const,
          instructions: "Is the supplied evidence sufficient?",
        },
        processor: {
          type: "choice" as const,
          instructions: "Choose processor",
          criteria: { JEV_DECISION: "Finite", PRIMARY_LLM: "Generation" },
        },
      };
      const response = nativeResponse(questions, { processor: "JEV_DECISION" });
      if (gate === "routing")
        (response.answers.processor as { confidence: number }).confidence = 0.2;
      else
        (response.answers.evidence_sufficient as { noul: number }).noul = 0.5;
      const { runtime } = setup(async () => json(response));
      await dual(runtime);
      const onRole = vi.fn();
      await expect(
        runtime.decide(
          { ...task, questions },
          { signal: new AbortController().signal, onRole },
        ),
      ).resolves.toBeUndefined();
      expect(onRole.mock.calls.at(-1)?.[0]).toMatchObject({
        provider_role: "primary",
        stage: "DELEGATING",
      });
    },
  );
  it("pre-dispatch failure preserves a full approved primary plan; post-dispatch failure blocks every further dispatch", async () => {
    const { runtime } = setup(async () => new Response("", { status: 503 }));
    await dual(runtime);
    const before = new AbortController().signal;
    await runtime.decide(task, { signal: before });
    await runtime.bindings.dispatched(before);
    await expect(runtime.bindings.dispatched(before)).resolves.toBeUndefined();
    const after = new AbortController().signal;
    await runtime.bindings.dispatched(after);
    await runtime.decide(task, { signal: after });
    await expect(runtime.bindings.dispatched(after)).rejects.toThrow(
      "POLICY_DENIED",
    );
  });
  it("native body timeout cancels the reader and normalizes its failure", async () => {
    const cancelled = vi.fn();
    const { runtime } = setup(
      async () =>
        new Response(new ReadableStream({ cancel: cancelled }), {
          headers: { "content-type": "application/json" },
        }),
    );
    await dual(runtime);
    const onRole = vi.fn();
    await expect(
      runtime.decide(task, { signal: new AbortController().signal, onRole }),
    ).resolves.toBeUndefined();
    expect(cancelled).toHaveBeenCalled();
    expect(onRole.mock.calls.at(-1)?.[0]).toMatchObject({
      stage: "FALLBACK",
      code: "PROVIDER_UNAVAILABLE",
    });
  });
});
