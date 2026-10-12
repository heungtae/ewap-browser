import { describe, expect, it, vi } from "vitest";
import { createActStepRunner } from "../../../src/service-worker/act-step-runner.js";
import { makeS17Test } from "./s17-test-support.js";

describe("page method read authority", () => {
  it.each(["sourceReadOnly", "componentReadOnly"] as const)(
    "does not probe runtime objects for %s",
    async (mode) => {
      const { session, dependencies } = makeS17Test();
      session[mode] = true;
      const discover = vi.fn();
      dependencies.discoverPageMethods = discover;
      dependencies.provider.chat = async (input) => {
        expect(
          (input.tools ?? []).some(
            (tool) => tool.function.name === "propose_page_method_call",
          ),
        ).toBe(false);
        return { content: "Inspection only", tool_calls: [] };
      };
      await createActStepRunner(dependencies).runStep(session);
      expect(discover).not.toHaveBeenCalled();
      expect(dependencies.executeApprovedProposal).not.toHaveBeenCalled();
    },
  );
});
