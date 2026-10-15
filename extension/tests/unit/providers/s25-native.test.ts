import { describe, expect, it, vi } from "vitest";
import { parseJevResponse } from "../../../src/providers/jev-response.js";
import { readNativeJson } from "../../../src/providers/native-json-body.js";
import { dual, json, nativeResponse, setup, task } from "./s25-support.js";
import type { DecisionTask } from "../../../src/providers/jev-types.js";
const mixed: DecisionTask["questions"] = {
  ...task.questions,
  yes: { type: "noul", instructions: "Is true?" },
  score: { type: "score", instructions: "Rate", criteria: ["low", "high"] },
};
describe("S25 native Jev contract", () => {
  it("validates real Choice, Noul and Score shapes", () => {
    expect(
      parseJevResponse(nativeResponse(mixed), mixed, "jev-1.13.0").answers.yes,
    ).toEqual({ type: "noul", noul: 0.99 });
  });
  it.each([
    "missing",
    "extra",
    "type",
    "range",
    "distribution",
    "selected",
    "confidence",
    "model",
    "usage",
    "legend",
    "score",
  ])("rejects %s malformed response", (kind) => {
    const value = nativeResponse(mixed) as unknown as {
      model: string;
      usage: { input_tokens: number };
      answers: Record<string, Record<string, unknown>>;
    };
    const answer = value.answers.verdict!;
    if (kind === "missing") delete value.answers.yes;
    if (kind === "extra") value.answers.injected = answer;
    if (kind === "type") answer.type = "noul";
    if (kind === "range") value.answers.yes!.noul = Infinity;
    if (kind === "distribution")
      answer.probabilities = { read: 0.4, action: 0.4 };
    if (kind === "selected") answer.choice = "injected";
    if (kind === "confidence") answer.confidence = NaN;
    if (kind === "model") value.model = "jev-latest";
    if (kind === "usage") value.usage.input_tokens = -1;
    if (kind === "legend")
      value.answers.score!.legend = { "0": "changed", "1": "high" };
    if (kind === "score") value.answers.score!.score = 2;
    expect(() => parseJevResponse(value, mixed, "jev-1.13.0")).toThrow(
      "PROVIDER_UNAVAILABLE",
    );
  });
  it("sends native JSON with separate credentials and performs a semantic connection test", async () => {
    const fetcher = vi.fn(
      async (url: RequestInfo | URL, options?: RequestInit) => {
        expect(String(url)).toBe("https://decision.example/v1/systemone");
        expect(new Headers(options?.headers).get("authorization")).toBe(
          "Bearer fixture-decision-secret",
        );
        const body = JSON.parse(String(options?.body)) as {
          questions: DecisionTask["questions"];
        };
        expect(body).not.toHaveProperty("messages");
        return json(nativeResponse(body.questions));
      },
    );
    const { runtime } = setup(fetcher);
    await dual(runtime);
    await expect(
      runtime.decide(task, { signal: new AbortController().signal }),
    ).resolves.toMatchObject({ source: "jev" });
    await expect(
      runtime.handle("PROVIDER_TEST", { id: "decision" }),
    ).resolves.toMatchObject({ ok: true, model: "jev-1.13.0" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("HTTP 200 with the wrong known answer fails connection testing", async () => {
    const { runtime } = setup(async (_url, options) =>
      json(
        nativeResponse(JSON.parse(String(options?.body)).questions, {
          color: "red",
        }),
      ),
    );
    await dual(runtime);
    await expect(
      runtime.handle("PROVIDER_TEST", { id: "decision" }),
    ).rejects.toThrow("PROVIDER_UNAVAILABLE");
  });
  it("rejects SSE and oversized native bodies", async () => {
    for (const text of ['data: {"answers":{}}\n\n', "x".repeat(65_537)]) {
      await expect(
        readNativeJson(new Response(text).body, new AbortController().signal),
      ).rejects.toThrow("PROVIDER_UNAVAILABLE");
    }
  });
});
