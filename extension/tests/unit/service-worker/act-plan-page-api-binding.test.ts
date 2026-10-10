import { expect, it } from "vitest";
import {
  storeSubmittedPlan,
  approveSubmittedPlan,
  assertApprovedPlan,
} from "../../../src/service-worker/act-plan-store.js";
import { parsePageApiProposal } from "../../../src/service-worker/act-proposal-parser.js";
import { fixturePageApiAdapter } from "../../../src/page-api/adapters/fixture.js";
import { makeS17Test, planArguments } from "./s17-test-support.js";
it("binds approved Page API plan input to registered option ID and rejects a display label", () => {
  const action = fixturePageApiAdapter.actions[0]!;
  const ref = {
    ...action,
    action_ref: "api-ref-abcdefghijklmnop",
    adapter_id: fixturePageApiAdapter.adapter_id,
    adapter_version: fixturePageApiAdapter.version,
  };
  const proposal = parsePageApiProposal(
    {
      id: "call-api",
      name: "propose_page_api",
      arguments: JSON.stringify({
        action_ref: ref.action_ref,
        option_id: "high",
        approval_scope: "single_step",
        approval_reason: "Approved registered option",
      }),
    },
    [ref],
    fixturePageApiAdapter.origins[0]!,
  );
  for (const userInput of ["high", "High"]) {
    const { session, active } = makeS17Test();
    storeSubmittedPlan({
      session,
      call: {
        id: "plan-call",
        name: "submit_plan",
        arguments: JSON.stringify({
          ...planArguments(),
          steps: [
            {
              ...planArguments().steps[0],
              capability: "propose_page_api",
              user_input: userInput,
            },
          ],
        }),
      },
      revision: 1,
      documentEpoch: active.snapshot.document_epoch,
      capabilities: ["propose_page_api"],
      evidenceIds: ["evidence-abcdefghijklmnop"],
    });
    approveSubmittedPlan(session, active.snapshot.document_epoch, 1);
    const verify = () =>
      assertApprovedPlan(session, proposal, active.snapshot.document_epoch, 1);
    if (userInput === "high") expect(verify).not.toThrow();
    else expect(verify).toThrow("CONFIRMATION_INVALID");
  }
});
