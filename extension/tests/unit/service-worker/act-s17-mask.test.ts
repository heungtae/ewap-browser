import { describe, expect, it } from "vitest";
import { maskTraceValue } from "../../../src/diagnostics/trace-mask.js";
describe("S17 diagnostics", () => {
  it("masks plan prose, inputs and echoed goal targets", () => {
    const secret = "s17-private-input";
    const result = maskTraceValue({
      arguments: JSON.stringify({ unexpected_field: secret }),
      classifier_response: JSON.stringify({
        details: { unexpected_field: secret },
      }),
      output_text: secret,
      refusal: secret,
      user_input: secret,
      target_name: secret,
      goal: secret,
      intent: secret,
      postcondition: secret,
      side_effects: [secret],
      provenance: secret,
      origin_diff: secret,
    });
    expect(JSON.stringify(result.data)).not.toContain(secret);
  });
});
