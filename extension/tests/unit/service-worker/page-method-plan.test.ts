import { describe, expect, it } from "vitest";
import { makeS17Test, planArguments } from "./s17-test-support.js";
import {
  storeSubmittedPlan,
  approveSubmittedPlan,
  assertApprovedPlan,
} from "../../../src/service-worker/act-plan-store.js";
import { parsePageMethodProposal } from "../../../src/service-worker/act-proposal-parser.js";
import { recordActExecution } from "../../../src/service-worker/act-execution-feedback.js";
import type { PageMethodRef } from "../../../src/contracts/page-method-types.js";

const method: PageMethodRef = {
  method_ref: "method-ref-abcdefghijkl",
  object_path: ["app", "read"],
  method_name: "read",
  arity: 1,
  function_kind: "unknown",
  locator_revision: "identity-abcdefghijkl",
};
describe("page method plan authority", () => {
  it("binds a plan to exact method, JSON arguments and revision while advancing invocation separately from verification", () => {
    const { session } = makeS17Test();
    session.pageMethods = [method];
    const epoch = "epoch-abcdefghijklmnop";
    const base = planArguments(1, "evidence-abcdefghijkl");
    const steps = [1, 2].map((value) => ({
      intent: "Read",
      capability: "propose_page_method_call",
      method_ref: method.method_ref,
      arguments: [value],
      postcondition: "Returned data",
    }));
    const args = { ...base, steps };
    const plan = storeSubmittedPlan({
      session,
      call: {
        id: "plan-call",
        name: "submit_plan",
        arguments: JSON.stringify(args),
      },
      revision: 1,
      documentEpoch: epoch,
      capabilities: ["propose_page_method_call"],
      evidenceIds: ["evidence-abcdefghijkl"],
    });
    approveSubmittedPlan(session, epoch, 1);
    const proposalFor = (value: number) =>
      parsePageMethodProposal(
        {
          id: `call-${value}`,
          name: "propose_page_method_call",
          arguments: JSON.stringify({
            method_ref: method.method_ref,
            source_evidence_id: "source-evidence-abcdefghijkl",
            arguments: [value],
            purpose: "Read",
            approval_scope: "single_step",
            approval_reason: "Requested",
          }),
        },
        [method],
        session.origin,
        new Map([["source-evidence-abcdefghijkl", "function read(value) {}"]]),
        { planId: plan.input.plan_id, planRevision: plan.revision },
      );
    const first = proposalFor(1);
    expect(() => assertApprovedPlan(session, first, epoch, 1)).not.toThrow();
    expect(() => assertApprovedPlan(session, proposalFor(2), epoch, 1)).toThrow(
      "CONFIRMATION_INVALID",
    );
    expect(() =>
      assertApprovedPlan(session, { ...first, planRevision: 0 }, epoch, 1),
    ).toThrow("CONFIRMATION_INVALID");
    recordActExecution(session, first, {
      ok: false,
      outcome: "UNKNOWN",
      dispatch: "dispatched",
      invocation: "returned",
      return_data: { available: true, value: "1" },
    });
    expect(plan.nextStep).toBe(1);
    expect(plan.completedSteps).toBe(0);
    expect(() =>
      assertApprovedPlan(session, proposalFor(2), epoch, 1),
    ).not.toThrow();
    expect(() => assertApprovedPlan(session, first, epoch, 1)).toThrow(
      "CONFIRMATION_INVALID",
    );
  });
  it("rejects an unbound method or missing exact arguments at plan submission", () => {
    const { session } = makeS17Test();
    session.pageMethods = [method];
    const base = planArguments(1, "evidence-abcdefghijkl");
    expect(() =>
      storeSubmittedPlan({
        session,
        call: {
          id: "plan",
          name: "submit_plan",
          arguments: JSON.stringify({
            ...base,
            steps: [
              {
                intent: "Read",
                capability: "propose_page_method_call",
                method_ref: "foreign-ref",
                postcondition: "Return",
              },
            ],
          }),
        },
        revision: 1,
        documentEpoch: "epoch",
        capabilities: ["propose_page_method_call"],
        evidenceIds: ["evidence-abcdefghijkl"],
      }),
    ).toThrow("INVALID_ARGUMENT");
  });
});
