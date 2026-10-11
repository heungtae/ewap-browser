import { describe, expect, it } from "vitest";
import { repeatedMutation } from "../../../src/service-worker/act-mutation-history.js";
import { setupAssessment } from "./s21-assessment-support.js";

describe("S21 duplicate mutation prevention", () => {
  it("blocks uncertain retries and an identical verified proposal, including a unique read replacement", () => {
    const { session, proposal, active } = setupAssessment();
    expect(repeatedMutation(session, proposal, active)).toBe(true);
    session.executionEvidence![0]!.outcome = "VERIFIED";
    expect(repeatedMutation(session, proposal, active)).toBe(true);
    active.snapshot.nodes[0]!.ref_id = "replacement-abcdefghijkl";
    expect(
      repeatedMutation(
        session,
        { ...proposal, refId: active.snapshot.nodes[0]!.ref_id },
        active,
      ),
    ).toBe(true);
  });
  it("permits a proven pre-dispatch rejection to reach the separate approval gate", () => {
    const { session, proposal, active } = setupAssessment("not_dispatched");
    session.executionEvidence![0]!.outcome = "FAILED";
    expect(repeatedMutation(session, proposal, active)).toBe(false);
  });
  it("does not treat a different approved input as an identical verified state setting", () => {
    const { session, proposal, active } = setupAssessment();
    session.executionEvidence![0]!.outcome = "VERIFIED";
    expect(
      repeatedMutation(
        session,
        { ...proposal, argument: { checked: false } },
        active,
      ),
    ).toBe(false);
    session.executionEvidence![0]!.outcome = "UNKNOWN";
    expect(
      repeatedMutation(
        session,
        { ...proposal, argument: { checked: false } },
        active,
      ),
    ).toBe(true);
  });
});
