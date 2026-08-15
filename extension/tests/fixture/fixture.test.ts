import { describe, expect, it } from "vitest";
import { executePrimitive } from "../../src/content/executor.js";
import type { ActionIntent } from "../../src/contracts/types.js";
const intent: ActionIntent = {
  tool: "set_checked_by_ref",
  run_id: "r",
  tab_id: 1,
  frame_id: 0,
  document_epoch: "e",
  profile: { id: "p", version: 1 },
  ref_id: "x",
  risk: "R1",
  effect: "local-ui-only",
  verifier: {
    kind: "semantic-state-transition",
    declaration_id: "d",
    pre_state_digest: "p",
    required_changes: [],
  },
  argument: { checked: true },
};
describe("controlled mutation fixture", () =>
  it("given_checkbox_transition_when_executing_then_verified", () =>
    expect(
      executePrimitive(intent, {
        role: "checkbox",
        name: "Opt in",
        visible: true,
        enabled: true,
        tag: "other",
        checked: false,
      }).outcome,
    ).toBe("VERIFIED")));
