import { it, expect, vi } from "vitest";
import { runHarnessReadTurns } from "../../../src/service-worker/act-harness-turns.js";
import { createLearnedSession } from "../../../src/learned-profile/session.js";
import { setup, receipt, match, snapshot, task } from "./helpers.js";
it("executes registered learned metadata and returns its result into the same Act conversation", async () => {
  const { store } = setup();
  const session = createLearnedSession({
    ticket: (await store.lookup(match))!,
    store,
    mode: "act",
    snapshot,
    current: () => true,
  });
  const chat = vi
    .fn()
    .mockResolvedValueOnce({
      content: "",
      tool_calls: [
        {
          id: "learned-call-abcdefghijklmnop",
          name: "describe_learned_task",
          arguments:
            '{"kind":"search","target":"form","coverage":"visible","input":"text"}',
        },
      ],
    })
    .mockResolvedValueOnce({ content: "Ready", tool_calls: [] });
  const loop = await runHarnessReadTurns({
    chat,
    messages: [],
    offeredTools: session.tools,
    readNames: session.tools.map((t) => t.function.name),
    executeRead: (call) =>
      session.execute({ name: call.name, arguments: call.args }, vi.fn()),
    serialise: JSON.stringify,
    expectedRevision: 1,
  });
  expect(loop.exhausted).toBe(false);
  expect(loop.messages.find((m) => m.role === "tool")).toMatchObject({
    tool_call_id: "learned-call-abcdefghijklmnop",
  });
  expect(await session.seal(true)).toBe("SAVED");
});
it("charges nested command reads before dispatch and returns budget exhaustion", async () => {
  const { store } = setup();
  await store.commit(
    await receipt(
      store,
      task,
      Array.from({ length: 4 }, () => ({
        channel: "read" as const,
        operation: "read_page" as const,
      })),
    ),
  );
  const session = createLearnedSession({
    ticket: (await store.lookup(match))!,
    store,
    mode: "ask",
    snapshot,
    current: () => true,
  });
  const execute = vi.fn();
  const loop = await runHarnessReadTurns({
    chat: async () => ({
      content: "",
      tool_calls: [
        {
          id: "budget-call-abcdefghijklmnop",
          name: "page_cmd_0",
          arguments: "{}",
        },
      ],
    }),
    messages: [],
    offeredTools: session.tools,
    readNames: session.tools.map((t) => t.function.name),
    executeRead: execute,
    readCost: (call) =>
      session.readCost({ name: call.name, arguments: call.args }),
    serialise: JSON.stringify,
    expectedRevision: 1,
    maxReads: 2,
  });
  expect(loop.exhausted).toBe(true);
  expect(execute).not.toHaveBeenCalled();
  expect(await session.seal(true)).toBe("INELIGIBLE");
});
it("does not expose a corrupted command backend/effect or missing recipe revision", async () => {
  const { store } = setup();
  await store.commit(await receipt(store));
  const ticket = (await store.lookup(match))!;
  ticket.profile!.commands[0]!.recipe_revision = 99;
  const session = createLearnedSession({
    ticket,
    store,
    mode: "ask",
    snapshot,
    current: () => true,
  });
  expect(session.handles("page_cmd_0")).toBe(false);
});
