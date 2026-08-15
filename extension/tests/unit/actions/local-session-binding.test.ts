import { describe, expect, it } from "vitest";
import { LocalFixtureSessionBinding } from "../../../src/state/local-session-binding.js";

describe("local fixture session binding", () => {
  it("given_cross_epoch_binding_when_verifying_then_denied", () => {
    const bindings = new LocalFixtureSessionBinding();
    const binding = bindings.issue("run", "epoch");
    expect(() => bindings.verify(binding, "run", "other-epoch")).toThrow(
      "CONFIRMATION_INVALID",
    );
  });
});
