import { expect, it } from "vitest";
import { eventSequenceDecision } from "../../../src/sidepanel/event-sequence.js";
import { TabChatSessionStore } from "../../../src/state/tab-chat-session-store.js";

it("continues past an approval omitted from recovered history into the next request", () => {
  // seq 2 was an approval and cannot survive worker restart.
  const recovery = [1, 3, 4, 5];
  let previous = 0;
  const applied: number[] = [];
  for (const sequence of recovery) {
    if (eventSequenceDecision(previous, sequence, true) === "apply") {
      previous = sequence;
      applied.push(sequence);
    }
  }
  expect(applied).toEqual(recovery);
  expect(eventSequenceDecision(previous, 6)).toBe("apply");
});

it("still resyncs live gaps and ignores duplicate recovered events", () => {
  expect(eventSequenceDecision(1, 3)).toBe("resync");
  expect(eventSequenceDecision(3, 3, true)).toBe("ignore");
  expect(eventSequenceDecision(3, 2, true)).toBe("ignore");
});

it("renders a fresh approval after restoring a completed Act request", () => {
  const store = new TabChatSessionStore();
  const scope = {
    document_epoch: "document-abcdefghijklmnop",
    page_scope_epoch: "scope-abcdefghijklmnop",
    origin: "https://fixture.company.test",
    path: "/ssh",
  };
  const action = {
    session_id: "session-abcdefghijklmnop",
    proposal_id: "proposal-abcdefghijklmnop",
    tool: "click_by_ref" as const,
    target_name: "Remote",
  };
  store.bindRun("run-first-abcdefghijkl", 1, scope);
  store.append("run-first-abcdefghijkl", {
    type: "user_message",
    text: "Open SSH",
  });
  store.append("run-first-abcdefghijkl", {
    type: "action_review_required",
    action,
  });
  store.append("run-first-abcdefghijkl", {
    type: "run_terminal",
    outcome: "VERIFIED",
  });
  expect(
    store
      .sinceThreadForRun("run-first-abcdefghijkl", 0)
      .map((event) => event.sequence),
  ).toEqual([1, 3]);
  const restored = new TabChatSessionStore();
  restored.restore(store.snapshot());
  restored.bindRun("run-second-abcdefghijk", 1, scope);
  restored.append("run-second-abcdefghijk", {
    type: "user_message",
    text: "Open agent skills",
  });
  restored.append("run-second-abcdefghijk", {
    type: "action_review_required",
    action: { ...action, target_name: "Agents" },
  });
  let previous = 0;
  const applied = restored.recoverable(1).filter((event) => {
    if (eventSequenceDecision(previous, event.sequence, true) !== "apply")
      return false;
    previous = event.sequence;
    return true;
  });
  expect(applied.at(-1)).toMatchObject({
    type: "action_review_required",
    action: { target_name: "Agents" },
  });
  expect(
    applied.filter((event) => event.type === "action_review_required"),
  ).toHaveLength(1);
});
