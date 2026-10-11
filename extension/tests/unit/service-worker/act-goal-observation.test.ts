import { createActStepRunner } from "../../../src/service-worker/act-step-runner.js";
import { executionInventory } from "./s17-test-support.js";
import { describe, expect, it } from "vitest";
import {
  goalObservationDigest,
  goalEvidenceCurrent,
} from "../../../src/service-worker/act-goal-observation.js";
import { digestCanonical } from "../../../src/security/canonical.js";
import { makeS17Test } from "./s17-test-support.js";
import type { SemanticSnapshot } from "../../../src/contracts/types.js";

const observed = (): SemanticSnapshot => ({
  ...makeS17Test().active.snapshot,
  nodes: [
    {
      ref_id: "dialog-original-12345",
      role: "dialog",
      name: "Pricing",
      visible: true,
      enabled: true,
      state: {},
      completion_digest: digestCanonical("Basic $10"),
    },
  ],
});
describe("goal evidence freshness", () => {
  it("R02 keeps a complete result region valid when unrelated background text changes", () => {
    const before = observed(),
      after = structuredClone(before);
    after.visible_text = "Pricing plus unrelated notification";
    expect(goalObservationDigest(before)).not.toBe(
      goalObservationDigest(after),
    );
    expect(goalEvidenceCurrent(before, after, [0])).toBe(true);
    expect(goalEvidenceCurrent(before, after, [])).toBe(false);
  });
  it("R03 invalidates changed prices, missing regions, duplicates and incomplete projections", () => {
    const before = observed(),
      after = structuredClone(before);
    after.nodes[0]!.completion_digest = digestCanonical("Basic $20");
    expect(goalEvidenceCurrent(before, after, [0])).toBe(false);
    after.nodes = [];
    expect(goalEvidenceCurrent(before, after, [0])).toBe(false);
    after.nodes = [before.nodes[0]!, before.nodes[0]!];
    expect(goalEvidenceCurrent(before, after, [0])).toBe(false);
    expect(
      goalEvidenceCurrent(before, { ...before, truncated: true }, [0]),
    ).toBe(false);
  });
  it("R06 tolerates reference churn only for reads while retaining semantic relationships", () => {
    const before = observed(),
      after = structuredClone(before);
    after.nodes[0]!.ref_id = "dialog-replacement-123";
    expect(goalEvidenceCurrent(before, after, [0])).toBe(true);
    expect(goalObservationDigest(before)).toBe(goalObservationDigest(after));
    before.nodes.push({
      ...before.nodes[0]!,
      ref_id: "child-123456789012345",
      parent_ref_id: before.nodes[0]!.ref_id,
    });
    const different = structuredClone(before);
    delete different.nodes[1]!.parent_ref_id;
    expect(goalObservationDigest(before)).not.toBe(
      goalObservationDigest(different),
    );
  });
  it("R02 uses supplied scoped evidence during actual goal reporting without retrying unrelated drift", async () => {
    const { session, dependencies, active } = makeS17Test();
    Object.assign(active.snapshot, observed());
    session.executionEvidence = [
      {
        action_id: "action",
        dispatched: true,
        observed: true,
        verifier: "satisfied",
        outcome: "VERIFIED",
        navigation: false,
        alreadySatisfied: false,
      },
    ];
    let calls = 0;
    dependencies.provider.chat = async (input) => {
      calls++;
      const schema = input.tools!.find(
        (t) => t.function.name === "report_goal_status",
      )!.function.parameters;
      const refs = (
        schema.properties as { evidence_refs: { items: { enum: string[] } } }
      ).evidence_refs.items.enum;
      active.snapshot.visible_text =
        "Pricing plus unrelated background notification";
      return {
        content: "",
        tool_calls: [
          {
            id: "goal-scoped",
            name: "report_goal_status",
            arguments: JSON.stringify({
              status: "completed",
              summary: "Pricing shown",
              observation_id: executionInventory(input.messages).observation_id,
              evidence_refs: refs,
            }),
          },
        ],
      };
    };
    const result = await createActStepRunner(dependencies).runStep(session);
    expect(result.completion).toMatchObject({
      goal_status: "completed",
      reassessments: 0,
    });
    expect(calls).toBe(1);
    expect(dependencies.executeApprovedProposal).not.toHaveBeenCalled();
  });
});
