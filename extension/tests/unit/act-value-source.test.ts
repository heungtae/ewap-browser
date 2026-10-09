import { describe, expect, it } from "vitest";
import { actValueSource } from "../../src/service-worker/act-value-source.js";
import { maskTraceValue } from "../../src/diagnostics/trace-mask.js";

const proposal = (
  source: ReturnType<typeof actValueSource>,
  overrides = {},
) => ({
  id: "call",
  name: "propose_set_text",
  arguments: JSON.stringify({
    target: "opaque-target",
    approval_scope: "single_step",
    approval_reason: "User requested input",
    value_source_revision: 3,
    value_span: {
      source_id: JSON.parse(source.context).user_value_source.source_id,
      start: 3,
      end: 6,
    },
    ...overrides,
  }),
});

describe("turn-local exact user source binding", () => {
  it("resolves only the model-selected substring and preserves approval fields", () => {
    const source = actValueSource("입력:ABC끝", 3);
    const result = JSON.parse(source.resolve(proposal(source)).arguments);
    expect(result.value).toBe("ABC");
    expect(result.value_source_revision).toBe(3);
    expect(result.approval_scope).toBe("single_step");
    expect(result.value_span).toBeUndefined();
  });
  it("rejects replay against a different turn and stale source revisions", () => {
    const source = actValueSource("입력:ABC끝", 3);
    expect(() =>
      actValueSource("입력:ABC끝", 3).resolve(proposal(source)),
    ).toThrow("VALUE_BINDING_INVALID");
    expect(() =>
      source.resolve(proposal(source, { value_source_revision: 2 })),
    ).toThrow("VALUE_BINDING_INVALID");
    expect(() => source.resolve(proposal(source, { value: "other" }))).toThrow(
      "VALUE_BINDING_INVALID",
    );
  });
  it("rejects invalid boundaries, split Unicode pairs, and oversized values", () => {
    for (const [text, start, end] of [
      ["x😀y", 1, 2],
      ["abc", -1, 2],
      ["abc", 0, 9],
      ["x".repeat(4097), 0, 4097],
    ] as const) {
      const source = actValueSource(text, 3);
      const sourceId = JSON.parse(source.context).user_value_source.source_id;
      expect(() =>
        source.resolve(
          proposal(source, { value_span: { source_id: sourceId, start, end } }),
        ),
      ).toThrow("VALUE_BINDING_INVALID");
    }
  });
  it("preserves literal compatibility and masks indexed original text", () => {
    const source = actValueSource("sensitive-original-user-text", 3);
    const literal = {
      id: "call",
      name: "propose_set_text",
      arguments: '{"value":"literal","value_source_revision":3}',
    };
    expect(source.resolve(literal)).toBe(literal);
    const masked = maskTraceValue(JSON.parse(source.context));
    expect(masked.masking.masked).toBe(true);
    expect(JSON.stringify(masked.data)).not.toContain("boundary_characters");
  });
});
