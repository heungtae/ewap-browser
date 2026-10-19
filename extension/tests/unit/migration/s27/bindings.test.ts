import { describe, expect, it } from "vitest";
import {
  bindArgument,
  bindFragment,
  digest,
  previousLocalDay,
} from "../../../../../packages/task-engine/src/decisions/index.js";
import { bindingContext, literal, candidate, context } from "./support.js";
describe("S27-R02 argument provenance", () => {
  it("binds the exact current literal, never an invented equipment ID", () => {
    const ctx = bindingContext();
    expect(bindArgument(literal, ctx)).toMatchObject({
      status: "BOUND",
      value: "EQP001",
    });
    expect(
      bindArgument({ ...literal, spanDigest: digest("EQP999") }, ctx).status,
    ).toBe("NEED_INPUT");
    expect(bindArgument({ ...literal, value: "EQP999" }, ctx).status).toBe(
      "NEED_INPUT",
    );
    expect(
      bindFragment(candidate(), new Map([["equipment", literal]]), ctx).status,
    ).toBe("BOUND");
    expect(bindFragment(candidate(), new Map(), ctx).status).toBe("NEED_INPUT");
  });
  it("accepts trusted bound slots and rejects stale prompts, secrets and foreign task values", () => {
    const ctx = bindingContext(),
      value = {
        value: "EQP001",
        unit: null,
        sensitive: false,
        authorized: true,
        contextDigest: digest(context),
        promptRevision: 3,
      };
    ctx.approved = new Map([["prompt-1", value]]);
    const slot = {
      kind: "approved_input",
      promptId: "prompt-1",
      promptRevision: 3,
      valueType: "string",
      unit: null,
    };
    expect(bindArgument(slot, ctx).status).toBe("BOUND");
    expect(bindArgument({ ...slot, promptRevision: 2 }, ctx).status).toBe(
      "NEED_INPUT",
    );
    for (const patch of [
      { sensitive: true },
      { authorized: false },
      { contextDigest: digest({ taskId: "foreign" }) },
    ]) {
      ctx.approved = new Map([["prompt-1", { ...value, ...patch }]]);
      expect(bindArgument(slot, ctx).status).toBe("NEED_INPUT");
    }
    ctx.sensitiveSpans = [{ start: 7, end: 13 }];
    expect(bindArgument(literal, ctx).status).toBe("NEED_INPUT");
  });
  it("checks authorized observed options and both revisions", () => {
    const ctx = bindingContext();
    ctx.observed = new Map([
      [
        "option-1",
        {
          value: "EQP001",
          unit: null,
          sensitive: false,
          authorized: true,
          contextDigest: digest(context),
          graphRevision: 1,
          evidenceRevision: 1,
        },
      ],
    ]);
    const binding = {
      kind: "observed_value",
      ref: "option-1",
      graphRevision: 1,
      evidenceRevision: 1,
      valueType: "string",
      unit: null,
    };
    expect(bindArgument(binding, ctx).status).toBe("BOUND");
    expect(bindArgument({ ...binding, evidenceRevision: 2 }, ctx).status).toBe(
      "NEED_INPUT",
    );
    expect(bindArgument({ ...binding, ref: "invented" }, ctx).status).toBe(
      "NEED_INPUT",
    );
  });
  it("resolves yesterday at admission timezone; ambiguity cannot invent a date", () => {
    const ctx = bindingContext();
    const yesterday = {
      kind: "user_span",
      start: 14,
      end: 23,
      spanDigest: digest("yesterday"),
      valueType: "string",
      unit: null,
    };
    const derived = {
      kind: "derived_value",
      transform: "relative-day-v1",
      sources: [yesterday],
      valueType: "date_range",
      unit: null,
    };
    expect(bindArgument(derived, ctx)).toMatchObject({
      status: "BOUND",
      value: {
        start: "2026-10-17T15:00:00.000Z",
        end: "2026-10-18T15:00:00.000Z",
        timezone: "Asia/Seoul",
      },
    });
    delete ctx.timezone;
    expect(bindArgument(derived, ctx).status).toBe("NEED_INPUT");
    expect(
      previousLocalDay("2026-03-09T12:00:00Z", "America/New_York"),
    ).toMatchObject({
      start: "2026-03-08T05:00:00.000Z",
      end: "2026-03-09T04:00:00.000Z",
    });
  });
  it("rejects arbitrary transforms and preserves exact aggregate units/precision", () => {
    const ctx = bindingContext();
    expect(
      bindArgument(
        {
          kind: "derived_value",
          transform: "eval",
          sources: [literal],
          valueType: "number",
          unit: null,
        },
        ctx,
      ).status,
    ).toBe("NEED_INPUT");
    ctx.observed = new Map(
      [1, 2].map((n) => [
        `count-${n}`,
        {
          value: n,
          unit: "alarms",
          sensitive: false,
          authorized: true,
          contextDigest: digest(context),
          graphRevision: 1,
          evidenceRevision: 1,
        },
      ]),
    );
    const sources = [1, 2].map((n) => ({
      kind: "observed_value",
      ref: `count-${n}`,
      graphRevision: 1,
      evidenceRevision: 1,
      valueType: "number",
      unit: "alarms",
    }));
    expect(
      bindArgument(
        {
          kind: "derived_value",
          transform: "sum-integers-v1",
          sources,
          valueType: "number",
          unit: "alarms",
        },
        ctx,
      ),
    ).toMatchObject({ status: "BOUND", value: 3, unit: "alarms" });
    expect(
      bindArgument(
        {
          kind: "derived_value",
          transform: "sum-integers-v1",
          sources,
          valueType: "number",
          unit: "seconds",
        },
        ctx,
      ).status,
    ).toBe("NEED_INPUT");
  });
});
