import { describe, expect, it, vi } from "vitest";
import {
  bindFragment,
  acceptResult,
  createFrame,
  enumerateCandidates,
  DecisionBudget,
  DecisionController,
  validateFragment,
  digest,
} from "../../../../../packages/task-engine/src/decisions/index.js";
import { NativeJevController } from "../../../../../packages/provider-adapters/src/jev/index.js";
import {
  literal,
  bindingContext,
  candidate,
  context,
  eligibility,
  frame,
  response,
} from "./support.js";
describe("S27 binding and availability negatives", () => {
  it("an effect annotation cannot turn fill into an Ask operation", () => {
    const c = candidate();
    c.modes = ["ask", "act"];
    c.steps[0]!.effect = "read";
    expect(
      enumerateCandidates(
        { ...context, mode: "ask" },
        [eligibility(c)],
        new Set(["search-capability"]),
      ).candidates,
    ).toHaveLength(0);
    expect(() => validateFragment(c, { ...context, mode: "ask" })).toThrow();
  });
  it("missing live targets and unresolved bindings remain input work", () => {
    const c = candidate();
    delete c.steps[0]!.actionRef;
    const page = enumerateCandidates(
      context,
      [eligibility(c)],
      new Set(["search-capability"]),
    );
    expect(page.candidates[0]?.unresolvedInputs).toEqual([
      "target:search.fill",
    ]);
    const { digest: _digest, ...payload } = frame();
    const f = createFrame({ ...payload, candidateSet: page });
    expect(acceptResult(f, response(f)).outcome).toBe("NEED_INPUT");
  });
  it("argument provenance changes invalidate the selected fragment even before dispatch preparation", () => {
    const c = candidate();
    c.bindingDigests.equipment = digest("different source");
    const result = bindFragment(
      c,
      new Map([["equipment", literal]]),
      bindingContext(),
    );
    expect(result.status).toBe("NEED_INPUT");
    expect(result.arguments.get("equipment")).toEqual({
      status: "NEED_INPUT",
      reason: "ARGUMENT_SOURCE_CHANGED",
    });
  });
  it("rejects revision-foreign cursors even if a caller rehashes the frame", () => {
    const inputs = Array.from({ length: 29 }, (_v, i) =>
      eligibility(candidate(`candidate-${i}`)),
    );
    const page = enumerateCandidates(
      context,
      inputs,
      new Set(["search-capability"]),
    );
    const { id: _id, digest: _pageDigest, ...payload } = page;
    payload.cursor!.contextDigest = digest("foreign");
    const modified = {
      ...payload,
      id: `set:${digest(payload)}`,
      digest: digest(payload),
    };
    const { digest: _frameDigest, ...f } = frame();
    expect(() => createFrame({ ...f, candidateSet: modified })).toThrow(
      "STALE_FRAME_CURSOR",
    );
  });
  it("network failure is explicitly unavailable, sanitized and has no fallback", async () => {
    const budget = new DecisionBudget(),
      fetcher = vi
        .fn<typeof fetch>()
        .mockRejectedValue(new Error("sensitive endpoint detail"));
    const port = new NativeJevController(
      {
        endpoint: "https://jev.fixture.test/v1/systemone",
        model: "jev-1.13.0",
        modelRevision: 1,
        apiKey: "fixture-native-key",
        enabled: true,
      },
      fetcher,
    );
    const result = await new DecisionController(
      port,
      budget,
      () => context,
    ).evaluate(frame(budget));
    expect(result.outcome).toBe("CONTROLLER_UNAVAILABLE");
    expect(result.reason).toBe("CONTROLLER_TRANSPORT_FAILED");
    expect(JSON.stringify(result)).not.toContain("sensitive endpoint detail");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("malformed output is UNKNOWN and cannot be mistaken for transport success", async () => {
    const budget = new DecisionBudget();
    const result = await new DecisionController(
      { evaluate: async (f) => ({ ...response(f), modelRevision: 99 }) },
      budget,
      () => context,
    ).evaluate(frame(budget));
    expect(result.outcome).toBe("UNKNOWN");
    expect(result.firstFailure).toBe("INVALID_OR_STALE_RESPONSE");
  });
});
