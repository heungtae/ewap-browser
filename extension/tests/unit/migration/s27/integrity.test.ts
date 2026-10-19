import { describe, expect, it } from "vitest";
import {
  acceptResult,
  createFrame,
  enumerateCandidates,
  digest,
  jsonSchemas,
  decisionResultJsonSchema,
  validateFrame,
  validateFragment,
} from "../../../../../packages/task-engine/src/decisions/index.js";
import { context, candidate, eligibility, frame, response } from "./support.js";
describe("S27-R01 closed frames and candidates", () => {
  it("exports schemas from closed Zod definitions and rejects unknown fields", () => {
    expect(jsonSchemas.frame.additionalProperties).toBe(false);
    expect(decisionResultJsonSchema.additionalProperties).toBe(false);
    expect(() => validateFrame({ ...frame(), approval: true })).toThrow();
  });
  it.each([
    "frameDigest",
    "candidateDigest",
    "modelRevision",
    "model",
    "templateVersion",
  ])("rejects foreign %s", (key) => {
    const f = frame(),
      r = response(f);
    expect(() =>
      acceptResult(f, { ...r, [key]: key === "modelRevision" ? 2 : "foreign" }),
    ).toThrow();
  });
  it("rejects old task/plan/cancellation/evidence revisions", () => {
    const f = frame();
    for (const key of [
      "taskRevision",
      "planRevision",
      "cancellationGeneration",
      "graphRevision",
      "evidenceRevision",
    ])
      expect(() =>
        acceptResult(f, { ...response(f), context: { ...context, [key]: 2 } }),
      ).toThrow();
  });
  it("rejects modified frames, foreign choices and invented executable fields", () => {
    const f = frame();
    expect(() => validateFrame({ ...f, facts: [] })).toThrow();
    expect(() => acceptResult(f, response(f, "invented"))).toThrow();
    const r = response(f);
    Object.assign(r.answers.decision, { arguments: { equipment: "invented" } });
    expect(() => acceptResult(f, r)).toThrow();
  });
  it("binds pages/cursors to exact revisions and does not hide omissions", () => {
    const inputs = Array.from({ length: 60 }, (_v, i) =>
      eligibility(candidate(`candidate-${String(i).padStart(2, "0")}`)),
    );
    const cap = new Set(["search-capability"]),
      first = enumerateCandidates(context, inputs, cap);
    expect(first.candidates).toHaveLength(28);
    expect(first.omitted).toBe(32);
    const second = enumerateCandidates(context, inputs, cap, first.cursor);
    expect(second.candidates).toHaveLength(28);
    expect(second.candidates[0]?.id).not.toBe(first.candidates[0]?.id);
    expect(() =>
      enumerateCandidates(
        { ...context, planRevision: 2 },
        inputs,
        cap,
        first.cursor,
      ),
    ).toThrow();
    expect(enumerateCandidates(context, [...inputs].reverse(), cap)).toEqual(
      first,
    );
  });
  it("intersects mode, policy, capabilities and freshness; missing parameters remain input work", () => {
    const c = candidate(),
      e = eligibility(c),
      caps = new Set(["search-capability"]);
    expect(
      enumerateCandidates({ ...context, mode: "ask" }, [e], caps).totalEligible,
    ).toBe(0);
    for (const patch of [{ policyPermitted: false }, { fresh: false }])
      expect(
        enumerateCandidates(context, [{ ...e, ...patch }], caps).totalEligible,
      ).toBe(0);
    expect(enumerateCandidates(context, [e], new Set()).totalEligible).toBe(0);
    expect(
      enumerateCandidates(
        context,
        [{ ...e, uniqueTarget: false, resolvedParameters: [] }],
        caps,
      ).candidates[0]?.unresolvedInputs,
    ).toEqual(["equipment", "target_selection"]);
  });
  it("never accepts a cycle/unordered fragment or over-budget frame", () => {
    const c = candidate();
    c.steps[0]!.dependencies = [c.steps[0]!.id];
    expect(() => validateFragment(c, context)).toThrow();
    const { digest: _digest, ...payload } = frame();
    expect(() =>
      createFrame({
        ...payload,
        facts: Array.from({ length: 20 }, (_v, i) => ({
          id: `fact-${i}`,
          value: "x".repeat(2048),
        })),
      }),
    ).toThrow(/FRAME_BYTE_LIMIT/);
    expect(digest(payload)).toHaveLength(64);
  });
});
