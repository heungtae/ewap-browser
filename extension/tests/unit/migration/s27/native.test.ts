import { describe, expect, it, vi } from "vitest";
import {
  NativeJevController,
  parseNativeResponse,
  readNativeJson,
} from "../../../../../packages/provider-adapters/src/jev/index.js";
import {
  acceptResult,
  createFrame,
} from "../../../../../packages/task-engine/src/decisions/index.js";
import { parseJevResponse } from "../../../../src/providers/jev-response.js";
import { frame, response } from "./support.js";
const config = {
  endpoint: "https://jev.fixture.test/v1/systemone",
  model: "jev-1.13.0",
  modelRevision: 1,
  apiKey: "fixture-native-key",
  enabled: true,
};
const wire = (f = frame()) => {
  const r = response(f);
  return { model: r.model, answers: r.answers, usage: r.usage };
};
describe("S27-R03 native validation", () => {
  it.each([
    "missing",
    "extra",
    "probabilities",
    "foreign",
    "model",
    "nonfinite",
  ])("rejects %s response", (kind) => {
    const f = frame(),
      r = response(f);
    if (kind === "missing")
      delete (r.answers as Partial<typeof r.answers>).evidence_sufficient;
    if (kind === "extra")
      Object.assign(r.answers, { extra: { type: "noul", noul: 1 } });
    if (kind === "probabilities") r.answers.decision.probabilities.search = 0.5;
    if (kind === "foreign") r.answers.decision.choice = "invented";
    if (kind === "model") r.model = "jev-latest";
    if (kind === "nonfinite") r.answers.decision.confidence = NaN;
    expect(() => acceptResult(f, r)).toThrow();
  });
  it("low confidence/selected probability/sufficiency and incomplete facts stay UNKNOWN", () => {
    const f = frame();
    for (const kind of ["confidence", "probability", "sufficiency"]) {
      const r = response(f);
      if (kind === "confidence") r.answers.decision.confidence = 0.89;
      if (kind === "probability") {
        r.answers.decision.probabilities.search = 0.8;
        r.answers.decision.probabilities.UNKNOWN = 0.2;
      }
      if (kind === "sufficiency") r.answers.evidence_sufficient.noul = 0.89;
      expect(acceptResult(f, r).outcome).toBe("UNKNOWN");
    }
    const { digest: _digest, ...p } = f;
    const incomplete = createFrame({ ...p, stateComplete: false });
    expect(acceptResult(incomplete, response(incomplete)).outcome).toBe(
      "UNKNOWN",
    );
  });
  it("uses the native envelope and correlation, never chat/tool-call IDs", async () => {
    const f = frame();
    const fetcher = vi.fn(
      async (_url: string | URL | Request, request?: RequestInit) => {
        const body = JSON.parse(String(request?.body));
        expect(Object.keys(body)).toEqual(["model", "state", "questions"]);
        expect(body.state.digest).toBe(f.digest);
        expect(body.messages).toBeUndefined();
        expect(request?.redirect).toBe("error");
        return Response.json(wire(f));
      },
    );
    const result = await new NativeJevController(config, fetcher).evaluate(f);
    expect(result.frameDigest).toBe(f.digest);
    expect(Object.keys(result)).not.toContain("tool_call_id");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(
      () => new NativeJevController({ ...config, model: "jev-latest" }),
    ).toThrow();
  });
  it("enforces the reserved conservative output byte envelope before accepting usage", async () => {
    const f = frame();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(wire(f)) + " ".repeat(1024), {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(
      new NativeJevController(config, fetcher).evaluate(f),
    ).rejects.toThrow("NATIVE_RESPONSE_BYTE_LIMIT");
  });
  it("matches the existing native choice/score/noul protocol without importing the legacy runtime", () => {
    const questions = {
      route: {
        type: "choice" as const,
        instructions: "Choose",
        criteria: { a: "A", b: "B" },
      },
      sufficient: { type: "noul" as const, instructions: "Enough?" },
      score: {
        type: "score" as const,
        instructions: "Rank",
        criteria: ["No", "Yes"],
      },
    };
    const payload = {
      model: config.model,
      usage: { input_tokens: 2, output_tokens: 3 },
      answers: {
        route: {
          type: "choice",
          choice: "a",
          confidence: 1,
          probabilities: { a: 1, b: 0 },
        },
        sufficient: { type: "noul", noul: 1 },
        score: {
          type: "score",
          score: 1,
          confidence: 1,
          probabilities: { "0": 0, "1": 1 },
          legend: { "0": "No", "1": "Yes" },
        },
      },
    };
    expect(parseNativeResponse(payload, questions, config.model)).toEqual(
      parseJevResponse(payload, questions, config.model),
    );
    payload.answers.score.legend["1"] = "invented";
    expect(() =>
      parseNativeResponse(payload, questions, config.model),
    ).toThrow();
  });
  it("bounds response bytes, invalid UTF8 and cancelled streams", async () => {
    const signal = new AbortController();
    await expect(
      readNativeJson(new Response("x".repeat(65537)).body, signal.signal),
    ).rejects.toThrow("NATIVE_RESPONSE_BYTE_LIMIT");
    await expect(
      readNativeJson(new Response(new Uint8Array([255])).body, signal.signal),
    ).rejects.toThrow();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const reading = readNativeJson(body, signal.signal);
    signal.abort();
    await expect(reading).rejects.toThrow();
    expect(cancelled).toBe(true);
  });
});
