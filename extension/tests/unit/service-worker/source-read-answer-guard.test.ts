import { describe, expect, it, vi } from "vitest";
import { runHarnessReadTurns } from "../../../src/service-worker/act-harness-turns.js";
import type { ProviderMessage } from "../../../src/providers/types.js";
import { createSourceReadAnswerGuard } from "../../../src/service-worker/source-read-answer-guard.js";

const partial = {
  status: "AVAILABLE",
  hits: [],
  next_cursor: "cursor-search-abcdefghijkl",
  coverage: { complete: false },
};
const searchCall = (index: number) => ({
  id: `call-search-${String(index).padStart(16, "0")}`,
  name: "search_page_resources",
  arguments: JSON.stringify({ query: "distantCalculation" }),
});

describe("source answer grounding", () => {
  it("suppresses a repeated ungrounded answer without falsely reporting budget exhaustion", async () => {
    let turn = 0;
    const messages: ProviderMessage[] = [];
    const result = await runHarnessReadTurns({
      sourceReadOnly: true,
      messages,
      offeredTools: [],
      readNames: ["search_page_resources"],
      expectedRevision: 1,
      maxRounds: 12,
      serialise: JSON.stringify,
      executeRead: async () => partial,
      chat: async () =>
        turn++ === 0
          ? { content: "", tool_calls: [searchCall(0)] }
          : {
              content: "The function does not exist anywhere.",
              tool_calls: [],
            },
    });
    expect(result).toMatchObject({
      content: "",
      incompleteReason: "SOURCE_SEARCH_INCOMPLETE",
      exhausted: false,
      rounds: 3,
      reads: 1,
    });
    expect(JSON.stringify(messages)).not.toContain("does not exist anywhere");
    expect(messages.at(-1)).toMatchObject({
      role: "system",
      content: expect.stringContaining("empty search still has unread pages"),
    });
  });

  it("allows the model to correct an early answer and finish the search itself", async () => {
    let turn = 0;
    const executeRead = vi
      .fn()
      .mockResolvedValueOnce(partial)
      .mockResolvedValueOnce({
        status: "AVAILABLE",
        hits: [],
        next_cursor: null,
      });
    const result = await runHarnessReadTurns({
      sourceReadOnly: true,
      messages: [],
      offeredTools: [],
      readNames: ["search_page_resources"],
      expectedRevision: 1,
      maxRounds: 12,
      serialise: JSON.stringify,
      executeRead,
      chat: async () => {
        const index = turn++;
        if (index === 0 || index === 2)
          return { content: "", tool_calls: [searchCall(index)] };
        return {
          content: index === 1 ? "absent" : "No match in the completed search.",
          tool_calls: [],
        };
      },
    });
    expect(result).toMatchObject({
      content: "No match in the completed search.",
      rounds: 4,
      reads: 2,
      exhausted: false,
    });
    expect(result.incompleteReason).toBeUndefined();
    expect(executeRead).toHaveBeenCalledTimes(2);
  });

  it("does not require irrelevant pages after a hit or clear limitations", () => {
    const guard = createSourceReadAnswerGuard();
    guard.observe(
      "search_page_resources",
      { query: "target" },
      { ...partial, hits: [{ resource_id: "resource-abcdefghijkl" }] },
    );
    expect(guard.review()).toBeUndefined();
    guard.observe(
      "search_page_resources",
      { query: "denied" },
      { status: "INCOMPLETE", hits: [], next_cursor: "cursor-abcdefghijkl" },
    );
    expect(guard.review()).toBeUndefined();
  });

  it("discards unsupported final prose even when the last round is consumed", async () => {
    let turn = 0;
    const result = await runHarnessReadTurns({
      sourceReadOnly: true,
      messages: [],
      offeredTools: [],
      readNames: ["search_page_resources"],
      expectedRevision: 1,
      maxRounds: 2,
      serialise: JSON.stringify,
      executeRead: async () => partial,
      chat: async () =>
        turn++ === 0
          ? { content: "", tool_calls: [searchCall(0)] }
          : { content: "invented absence", tool_calls: [] },
    });
    expect(result).toMatchObject({ content: "", exhausted: true, rounds: 2 });
  });
});
