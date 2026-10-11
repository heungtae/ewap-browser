import { describe, expect, it, vi } from "vitest";
import { confirmNavigation } from "../../../src/service-worker/act-navigation-confirmation.js";
import { digestCanonical } from "../../../src/security/canonical.js";
import { createActStepRunner } from "../../../src/service-worker/act-step-runner.js";
import { makeS17Test, executionInventory } from "./s17-test-support.js";
import type { NormalizedProviderRequest } from "../../../src/providers/types.js";

const setup = () => {
  const test = makeS17Test();
  Object.assign(test.active, {
    navigationUrlDigest: digestCanonical("https://fixture.test/"),
  });
  test.session.feedbackOnly = true;
  test.session.executionEvidence = [
    {
      action_id: "navigation-attempt",
      dispatched: true,
      dispatch: "dispatched",
      observed: false,
      verifier: "pending",
      outcome: "UNKNOWN",
      raw_outcome: "UNKNOWN",
      code: "NAVIGATION_UNVERIFIED",
      navigation: true,
      alreadySatisfied: false,
      navigation_binding: {
        destination_digest: digestCanonical("https://fixture.test/"),
        source_document_epoch: "previous-document",
        source_page_scope_epoch: "previous-scope",
      },
    },
  ];
  return test;
};
const report = { status: "completed", indexes: [0] };
describe("ISS-20261011-004 navigation provider confirmation", () => {
  it("accepts a current completed report for the dispatched approved destination once", () => {
    const { session, dependencies, active } = setup();
    expect(
      confirmNavigation(
        session,
        active,
        dependencies.pageScope(active),
        report,
        true,
      ),
    ).toBe(true);
    expect(session.executionEvidence![0]).toMatchObject({
      outcome: "VERIFIED",
      raw_outcome: "UNKNOWN",
      code: "NAVIGATION_UNVERIFIED",
      observed: true,
      verifier: "satisfied",
      confirmation: "llm_evidence",
    });
    expect(
      confirmNavigation(
        session,
        active,
        dependencies.pageScope(active),
        report,
        true,
      ),
    ).toBe(false);
  });
  it.each(["path", "query", "hash"])(
    "rejects a different destination %s even on the same origin",
    (part) => {
      const { session, dependencies, active } = setup();
      Object.assign(active, {
        navigationUrlDigest: digestCanonical(
          `https://fixture.test/${part === "path" ? "wrong" : part === "query" ? "?other=1" : "#other"}`,
        ),
      });
      expect(
        confirmNavigation(
          session,
          active,
          dependencies.pageScope(active),
          report,
          true,
        ),
      ).toBe(false);
    },
  );
  it.each([
    "stale",
    "source",
    "tab",
    "truncated",
    "failed",
    "dispatch",
    "refs",
    "incomplete",
    "unbound",
  ])("rejects %s evidence", (failure) => {
    const { session, dependencies, active } = setup();
    const evidence = session.executionEvidence![0]!;
    const scope = dependencies.pageScope(active);
    if (failure === "source")
      Object.assign(evidence.navigation_binding!, {
        source_document_epoch: scope.document_epoch,
        source_page_scope_epoch: scope.page_scope_epoch,
      });
    if (failure === "tab") active.tabId = 2;
    if (failure === "truncated")
      Object.assign(active.snapshot, { truncated: true });
    if (failure === "failed") evidence.raw_outcome = "FAILED";
    if (failure === "dispatch") evidence.dispatch = "unknown";
    if (failure === "unbound") delete evidence.navigation_binding;
    expect(
      confirmNavigation(
        session,
        active,
        scope,
        {
          status: failure === "incomplete" ? "incomplete" : "completed",
          indexes: failure === "refs" ? [] : [0],
        },
        failure !== "stale",
      ),
    ).toBe(false);
    expect(evidence.outcome).toBe("UNKNOWN");
  });
  it("keeps trusted destination markers mandatory", () => {
    const { session, dependencies, active } = setup();
    session.executionEvidence![0]!.navigation_binding!.destination_marker = {
      role: "main",
      name: "Expected destination",
    };
    expect(
      confirmNavigation(
        session,
        active,
        dependencies.pageScope(active),
        report,
        true,
      ),
    ).toBe(false);
  });
  it("finishes the real Worker goal flow after UNKNOWN without a second mutation", async () => {
    const { session, dependencies } = setup();
    dependencies.provider.chat = vi.fn(
      async (input: Pick<NormalizedProviderRequest, "messages" | "tools">) => {
        expect(input.tools!.map((tool) => tool.function.name)).toEqual([
          "report_goal_status",
        ]);
        const projection = [...input.messages]
          .reverse()
          .find((message) =>
            message.content.startsWith("[UNTRUSTED_PAGE_PROJECTION]"),
          )!;
        const node = JSON.parse(projection.content.split("\n")[1]!).nodes[0];
        return {
          content: "",
          tool_calls: [
            {
              id: "goal-completed",
              name: "report_goal_status",
              arguments: JSON.stringify({
                status: "completed",
                summary: "Destination reached",
                observation_id: executionInventory(input.messages)
                  .observation_id,
                evidence_refs: [node.model_ref],
              }),
            },
          ],
        };
      },
    );
    const result = await createActStepRunner(dependencies).runStep(session);
    expect(result.terminal).toBe("GOAL_VERIFIED");
    expect(result.completion).toMatchObject({
      action_outcome: "VERIFIED",
      goal_status: "completed",
    });
    expect(dependencies.executeApprovedProposal).not.toHaveBeenCalled();
    expect(session.executionEvidence![0]!.raw_outcome).toBe("UNKNOWN");
  });
});
