import { describe, expect, it, vi } from "vitest";
import { completeActProposal } from "../../../src/service-worker/act-proposal-completion.js";
import type {
  ActProposal,
  ActSession,
} from "../../../src/service-worker/act-session-types.js";
import type { Run } from "../../../src/state/run-coordinator.js";

const run: Run = {
  id: "run-abcdefghijklmnop",
  tabId: 1,
  frameId: 0,
  documentEpoch: "epoch-abcdefghijklmnop",
  mode: "act",
  tabContext: "context-abcdefghijkl",
  phase: "TERMINAL",
  outcome: "VERIFIED",
};
const proposal = {
  id: "proposal-abcdefghijkl",
  tool: "click_by_ref",
  refId: "target-abcdefghijklmnop",
  targetName: "Open SSH guide",
  toolCallId: "tool-call-abcdefghijkl",
} as ActProposal;

describe("Act proposal completion", () => {
  it("continues_a_completed_generic_act_in_the_approved_session", async () => {
    const publish = vi.fn();
    const publishTerminal = vi.fn();
    const continueWorkflow = vi.fn(async () => ({ ok: true }));
    const endSession = vi.fn();
    const session = {
      messages: [],
      proposal,
    } as unknown as ActSession;

    await expect(
      completeActProposal(
        { publish, publishTerminal, continueWorkflow, endSession },
        session,
        run,
        proposal,
        { ok: true },
        { success: "작업 결과를 확인했습니다.", failure: "작업 실패" },
      ),
    ).resolves.toEqual({ ok: true });

    expect(endSession).not.toHaveBeenCalled();
    expect(continueWorkflow).toHaveBeenCalledWith(session, proposal);
    expect(session.proposal).toBeUndefined();
    expect(session.messages).toContainEqual({
      role: "tool",
      tool_call_id: "tool-call-abcdefghijkl",
      content:
        '[UNTRUSTED_TOOL_RESULT]\n{"outcome":"VERIFIED","tool":"click_by_ref","target_name":"Open SSH guide"}\n[/UNTRUSTED_TOOL_RESULT]',
    });
  });

  it("ends_the_session_after_a_terminal_execution_failure", async () => {
    const publish = vi.fn();
    const publishTerminal = vi.fn();
    const continueWorkflow = vi.fn();
    const endSession = vi.fn();
    const session = { messages: [], proposal } as unknown as ActSession;

    await expect(
      completeActProposal(
        { publish, publishTerminal, continueWorkflow, endSession },
        session,
        run,
        proposal,
        { ok: false, code: "TARGET_STALE" },
        { success: "작업 결과를 확인했습니다.", failure: "작업 실패" },
      ),
    ).resolves.toMatchObject({ ok: false, code: "TARGET_STALE" });

    expect(publishTerminal).toHaveBeenCalledWith(run, "FAILED", "TARGET_STALE");
    expect(endSession).toHaveBeenCalledWith(session);
    expect(continueWorkflow).not.toHaveBeenCalled();
  });
});
