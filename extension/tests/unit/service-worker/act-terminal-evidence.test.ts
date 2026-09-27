import { describe, expect, it, vi } from "vitest";
import { createActTerminalPublisher } from "../../../src/service-worker/act-terminal-evidence.js";
import type { Run } from "../../../src/state/run-coordinator.js";

const run = { id: "run-1" } as Run;

describe("Act terminal evidence", () => {
  it("preserves_unknown_with_a_closed_code_and_emits_once_per_terminal", () => {
    let terminal = false;
    const publish = vi.fn(() => {
      terminal = true;
    });
    const evidence = vi.fn(async () => "SENT");
    const report = createActTerminalPublisher({
      has: () => true,
      terminal: () => terminal,
      publish,
      evidence,
    });
    report(run, "UNKNOWN", "POSTCONDITION_UNVERIFIED");
    report(run, "UNKNOWN", "POSTCONDITION_UNVERIFIED");
    expect(publish).toHaveBeenCalledTimes(1);
    expect(evidence).toHaveBeenCalledExactlyOnceWith({
      event: "terminal",
      run_id: run.id,
      outcome: "UNKNOWN",
      code: "POSTCONDITION_UNVERIFIED",
    });
  });
  it("never_copies_unrecognized_error_text_into_evidence", () => {
    const evidence = vi.fn(async () => "SENT");
    createActTerminalPublisher({
      has: () => true,
      terminal: () => false,
      publish: vi.fn(),
      evidence,
    })(run, "FAILED", "password-from-page");
    expect(evidence).toHaveBeenCalledExactlyOnceWith({
      event: "terminal",
      run_id: run.id,
      outcome: "FAILED",
    });
  });
});
