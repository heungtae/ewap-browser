import { describe, expect, it, vi } from "vitest";
import { ContractError } from "../../../src/security/validation.js";
import {
  dual,
  json,
  nativeResponse,
  primary,
  setup,
  task,
} from "./s25-support.js";
const chat = { choices: [{ message: { content: "Prepared answer" } }] };
describe("S25 request-bound routing", () => {
  it.each(["primary", "stop"])(
    "configured failure uses %s policy before dispatch and preserves first failure",
    async (policy) => {
      const fetcher = vi.fn(
        async () => new Response("private rejected input", { status: 429 }),
      );
      const { runtime } = setup(fetcher);
      await dual(runtime, policy);
      const signal = new AbortController().signal,
        onRole = vi.fn();
      if (policy === "stop")
        await expect(runtime.decide(task, { signal, onRole })).rejects.toThrow(
          "PROVIDER_UNAVAILABLE",
        );
      else
        await expect(
          runtime.decide(task, { signal, onRole }),
        ).resolves.toBeUndefined();
      expect(onRole.mock.calls.at(-1)?.[0]).toMatchObject({
        stage: policy === "stop" ? "STOPPED" : "FALLBACK",
        code: "PROVIDER_UNAVAILABLE",
      });
      expect(JSON.stringify(onRole.mock.calls)).not.toContain(
        "private rejected input",
      );
      await runtime.decide(
        { ...task, phase: "goal_assessment" },
        { signal, onRole },
      );
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it("after dispatch even stop permits only primary read/judgment recovery and never mutation proposals", async () => {
    const fetcher = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).includes("decision"))
          return new Response("", { status: 503 });
        const tools = JSON.parse(String(init?.body)).tools;
        expect(
          tools.map((t: { function: { name: string } }) => t.function.name),
        ).toEqual(["read_page"]);
        return json(chat);
      },
    );
    const { runtime } = setup(fetcher);
    await dual(runtime, "stop");
    const signal = new AbortController().signal;
    await runtime.bindings.dispatched(signal);
    await expect(runtime.decide(task, { signal })).resolves.toBeUndefined();
    await runtime.chat(
      {
        messages: [],
        tools: ["read_page", "propose_click", "submit_plan"].map((name) => ({
          type: "function",
          function: { name, description: "", parameters: {} },
        })),
      },
      { signal },
    );
  });
  it("permission rejection and cancellation never trigger failure fallback", async () => {
    const { runtime } = setup(async () => {
      throw new ContractError("POLICY_DENIED");
    });
    await dual(runtime);
    const onRole = vi.fn();
    await expect(
      runtime.decide(task, { signal: new AbortController().signal, onRole }),
    ).rejects.toThrow("POLICY_DENIED");
    expect(
      onRole.mock.calls.some(([event]) => event.stage === "FALLBACK"),
    ).toBe(false);
    const controller = new AbortController();
    controller.abort();
    await expect(
      runtime.decide(task, { signal: controller.signal }),
    ).rejects.toThrow("POLICY_DENIED");
  });
  it("freezes primary config across tool subcontrollers and ignores unrelated edits", async () => {
    const seen: string[] = [];
    const { runtime } = setup(async (url) => {
      seen.push(String(url));
      return json(chat);
    });
    await dual(runtime);
    const parent = new AbortController();
    await runtime.bindings.get(parent.signal);
    await runtime.handle("PROVIDER_SAVE", {
      id: "other",
      config: { ...primary, base_url: "https://other.example/v1" },
    });
    for (let i = 0; i < 2; i++)
      await runtime.chat(
        { messages: [] },
        { signal: new AbortController().signal, bindingSignal: parent.signal },
      );
    expect(seen).toEqual([
      "https://primary.example/v1/chat/completions",
      "https://primary.example/v1/chat/completions",
    ]);
    await runtime.handle("PROVIDER_SET_ACTIVE", { id: "other" });
    await expect(
      runtime.chat({ messages: [] }, { bindingSignal: parent.signal }),
    ).rejects.toThrow("POLICY_DENIED");
  });
  it("selected edits cancel waiting and live model work, with late results discarded", async () => {
    let release: (() => void) | undefined;
    const { runtime } = setup(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return json(nativeResponse(task.questions));
    });
    await dual(runtime);
    const signal = new AbortController().signal,
      cancelled = vi.fn();
    await runtime.bindings.get(signal, cancelled);
    const pending = runtime.decide(task, { signal });
    while (!release) await new Promise((resolve) => setTimeout(resolve, 1));
    await runtime.handle("PROVIDER_SAVE", {
      id: "decision",
      config: {
        ...primary,
        kind: "typesafe_jev",
        base_url: "https://decision.example/v1",
        model: "jev-1.13.0",
      },
    });
    release();
    await expect(pending).rejects.toThrow("POLICY_DENIED");
    expect(cancelled).toHaveBeenCalledOnce();
  });
  it("adding Jev affects only the next request, with primary streaming preserved in the bound single request", async () => {
    const { runtime } = setup(
      async () =>
        new Response(
          'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    await runtime.handle("PROVIDER_SAVE", { id: "primary", config: primary });
    const signal = new AbortController().signal;
    await runtime.bindings.get(signal);
    // Do not rewrite the primary while installing the decision role.
    const { jev } = await import("./s25-support.js");
    await runtime.handle("PROVIDER_SAVE", { id: "decision", config: jev });
    await runtime.handle("PROVIDER_SET_ROUTING", {
      revision: (await runtime.handle("PROVIDER_LIST", undefined)).revision,
      routing: {
        mode: "jev",
        decision_provider: "decision",
        pre_dispatch_failure: "primary",
      },
    });
    const onDelta = vi.fn();
    await runtime.chat({ messages: [] }, { signal, onDelta });
    expect(onDelta).toHaveBeenCalledWith("hello");
    expect((await runtime.bindings.get(signal)).decision).toBeUndefined();
    expect(
      (await runtime.bindings.get(new AbortController().signal)).decision?.kind,
    ).toBe("typesafe_jev");
  });
  it("rejects repeated unchanged state and caps decisions without resetting counters", async () => {
    const { runtime } = setup(async () => json(nativeResponse(task.questions)));
    await dual(runtime);
    const signal = new AbortController().signal;
    await runtime.decide(task, { signal });
    await expect(runtime.decide(task, { signal })).rejects.toThrow(
      "REQUEST_TIMEOUT",
    );
    const bound = await runtime.bindings.get(signal);
    bound.decisions = 24;
    await expect(
      runtime.decide({ ...task, state: { fresh: true } }, { signal }),
    ).rejects.toThrow("REQUEST_TIMEOUT");
  });
});
