import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createFrame,
  decisionFrameSchema,
  decisionResultSchema,
  argumentBindingSchema,
  planRevisionSchema,
  acceptResult,
  DecisionBudget,
  enumerateCandidates,
  nativeRequest,
} from "../../../../../packages/task-engine/src/decisions/index.js";
import {
  candidate,
  context,
  eligibility,
  frame,
  literal,
  response,
} from "./support.js";
describe("S27 closed-contract golden payloads", () => {
  it("validates accepted/rejected payload pairs without dropping foreign fields", () => {
    const f = frame();
    const pairs = [
      {
        schema: decisionFrameSchema,
        accepted: f,
        rejected: { ...f, unknownMandatory: true },
      },
      {
        schema: decisionResultSchema,
        accepted: response(f),
        rejected: { ...response(f), tool_call_id: "invented" },
      },
      {
        schema: argumentBindingSchema,
        accepted: literal,
        rejected: { ...literal, value: "invented" },
      },
      {
        schema: planRevisionSchema,
        accepted: {
          protocol: "wca.task/v1",
          revision: 1,
          context,
          steps: candidate().steps,
          allowedScopeIds: [context.scopeId],
          allowedOrigins: ["https://fixture.test"],
          allowedTabRefs: ["tab-1"],
          sourceCandidateIds: ["search"],
          evidenceRefs: ["observed"],
          unresolvedInputs: [],
          goalPredicates: ["filtered-equipment"],
          reservations: { toolInvocations: 1, mutations: 1 },
        },
        rejected: { protocol: "wca.task/v2" },
      },
    ];
    for (const pair of pairs) {
      expect(pair.schema.safeParse(pair.accepted).success).toBe(true);
      expect(pair.schema.safeParse(pair.rejected).success).toBe(false);
    }
  });
  it("preserves control outcomes, and omitted pages cannot prove unsupported", () => {
    const f = frame();
    for (const outcome of [
      "INSPECT_MORE",
      "NEED_INPUT",
      "UNSUPPORTED",
      "UNKNOWN",
    ] as const)
      expect(acceptResult(f, response(f, outcome)).outcome).toBe(outcome);
    const b = new DecisionBudget(),
      inputs = Array.from({ length: 29 }, (_v, i) =>
        eligibility(candidate(`candidate-${i}`)),
      );
    const page = enumerateCandidates(
      context,
      inputs,
      new Set(["search-capability"]),
    );
    const { digest: _digest, ...payload } = frame(b);
    const pagedFrame = createFrame({ ...payload, candidateSet: page });
    expect(
      acceptResult(pagedFrame, response(pagedFrame, "UNSUPPORTED")).outcome,
    ).toBe("INSPECT_MORE");
    expect(page.omitted).toBe(1);
    expect(payload.budgets).toEqual(b.snapshot());
    expect(() =>
      enumerateCandidates(context, inputs, new Set(["search-capability"]), {
        sourceDigest: page.sourceDigest,
        contextDigest: page.contextDigest,
        offset: -28,
      }),
    ).toThrow();
  });
  it("freezes holdout before native tuning and keeps expected labels off the wire", () => {
    const corpus = readFileSync("docs/baselines/s27/holdout.json");
    expect(createHash("sha256").update(corpus).digest("hex")).toBe(
      "88b2a25e4a5fd5bac4cd2523cc09fd5e1cdb7c4ef37641b7e3d258b318742570",
    );
    expect(JSON.stringify(nativeRequest(frame()))).not.toContain('"expected"');
  });
});
