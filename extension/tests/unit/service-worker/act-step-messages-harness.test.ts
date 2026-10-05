import { describe, expect, it } from "vitest";
import { actStepMessages } from "../../../src/service-worker/act-step-messages.js";

const sessionBase = (): Record<string, unknown> => ({
  id: "session-abcdefghijkl",
  tabId: 7,
  origin: "https://app.test",
  prompt: "Search query에 browser test를 입력해줘.",
  messages: [
    { role: "system", content: "system" },
    { role: "user", content: "User execution request: x" },
  ],
  profile: { id: "profile", version: 1 },
  discovery: "page-derived",
  definitions: [],
  profileDefinitions: [],
});

describe("act step messages harness block", () => {
  it("appends_the_first_payload_harness_block_after_the_projection", () => {
    const withBlock = actStepMessages({
      session: sessionBase(),
      profileContext: undefined,
      projection:
        "[UNTRUSTED_PAGE_PROJECTION]\ntext\n[/UNTRUSTED_PAGE_PROJECTION]",
      threadContext: [],
      harnessBlock:
        "[HARNESS_CONTEXT]\nrequest_revision: 1\n[/HARNESS_CONTEXT]",
    } as never);
    expect(withBlock.at(-1)?.content).toContain("[HARNESS_CONTEXT]");
    const withoutBlock = actStepMessages({
      session: sessionBase(),
      profileContext: undefined,
      projection:
        "[UNTRUSTED_PAGE_PROJECTION]\ntext\n[/UNTRUSTED_PAGE_PROJECTION]",
      threadContext: [],
    } as never);
    expect(
      withoutBlock.some((message) =>
        message.content.includes("[HARNESS_CONTEXT]"),
      ),
    ).toBe(false);
  });
});
