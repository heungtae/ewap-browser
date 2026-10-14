import { describe, it, expect, vi } from "vitest";
import { createLearnedSession } from "../../../src/learned-profile/session.js";
import { setup, receipt, match, task, snapshot } from "./helpers.js";
const describeTask = {
  name: "describe_learned_task",
  arguments: JSON.stringify({
    kind: "help",
    target: "page",
    coverage: "visible",
    input: "none",
  }),
};
async function learned(mode: "ask" | "act" = "ask", action = false) {
  const { store, data } = setup();
  await store.commit(
    await receipt(
      store,
      { ...task, mode },
      action ? [{ channel: "ui", operation: "click" }] : undefined,
    ),
  );
  const ticket = (await store.lookup(match))!;
  let current = true;
  const session = createLearnedSession({
    ticket,
    store,
    mode,
    snapshot,
    current: () => current,
  });
  const command = ticket.profile!.commands[0]!;
  return {
    store,
    data,
    session,
    command,
    stop: () => {
      current = false;
    },
  };
}
describe("request-local page commands", () => {
  it("generated function and command line use one invocation schema and existing reader", async () => {
    const { session, command } = await learned();
    const execute = vi.fn(async () => ({ nodes: [], truncated: false }));
    expect(
      await session.execute({ name: "page_cmd_0", arguments: "{}" }, execute),
    ).toMatchObject({ status: "AVAILABLE" });
    expect(execute).toHaveBeenCalledWith({
      name: "read_semantic_projection",
      arguments: "{}",
    });
    expect(
      await session.execute(
        {
          name: "page_command",
          arguments: JSON.stringify({ line: `page ${command.namespace} help` }),
        },
        execute,
      ),
    ).toMatchObject({ status: "AVAILABLE" });
  });
  it("commits after a generated command is successfully consumed", async () => {
    const { session } = await learned();
    expect(
      await session.execute(
        { name: "page_cmd_0", arguments: "{}" },
        async () => ({ nodes: [], truncated: false }),
      ),
    ).toMatchObject({ status: "AVAILABLE" });
    expect(await session.seal(true)).toBe("SAVED");
  });
  it("dry-run never dispatches, selects, writes, or learns", async () => {
    const { session, command, store } = await learned();
    const before = await store.snapshot();
    const execute = vi.fn();
    expect(
      await session.execute(
        { name: "page_cmd_0", arguments: '{"dry_run":true}' },
        execute,
      ),
    ).toMatchObject({
      status: "PROPOSED",
      dry_run: true,
      dispatch: "not_dispatched",
    });
    expect(
      await session.execute(
        {
          name: "page_command",
          arguments: JSON.stringify({
            line: `page ${command.namespace} help --dry-run`,
          }),
        },
        execute,
      ),
    ).toMatchObject({ status: "PROPOSED" });
    expect(execute).not.toHaveBeenCalled();
    expect(await session.seal(true)).toBe("INELIGIBLE");
    expect(await store.snapshot()).toEqual(before);
  });
  it("Act commands only propose; Ask excludes mutation commands", async () => {
    const { session, store } = await learned("act", true);
    const execute = vi.fn();
    expect(
      await session.execute({ name: "page_cmd_0", arguments: "{}" }, execute),
    ).toMatchObject({
      status: "PROPOSED",
      requires: "fresh_discovery_submit_plan_and_approval",
      dispatch: "not_dispatched",
    });
    expect(execute).not.toHaveBeenCalled();
    const ask = createLearnedSession({
      ticket: (await store.lookup(match))!,
      store,
      mode: "ask",
      snapshot,
      current: () => true,
    });
    expect(ask.handles("page_cmd_0")).toBe(false);
  });
  it("disabling or cancellation withdraws a previously bound command", async () => {
    const { session, store, stop } = await learned();
    const c = await store.snapshot();
    await store.manage(c.catalog_revision, "feature", undefined, {
      enabled: false,
    });
    const execute = vi.fn();
    expect(
      await session.execute({ name: "page_cmd_0", arguments: "{}" }, execute),
    ).toMatchObject({ status: "STALE" });
    stop();
    expect(await session.seal(true)).toBe("INELIGIBLE");
    expect(execute).not.toHaveBeenCalled();
  });
  it("saves only terminal eligible success and seals once before cancellation", async () => {
    const { session, stop, store } = await learned();
    await session.execute(describeTask, vi.fn());
    const saved = session.seal(true);
    stop();
    expect(await saved).toBe("SAVED");
    expect(await session.seal(true)).toBe("INELIGIBLE");
    expect((await store.snapshot()).records[0]!.recipes[0]!.revision).toBe(2);
  });
  it("initial failure, unverified mutation, partial coverage and wrong document never learn", async () => {
    for (const failure of [
      "read",
      "mutation",
      "coverage",
      "document",
      "batch",
      "overflow",
    ]) {
      const { session } = await learned();
      await session.execute(describeTask, vi.fn());
      if (failure === "read")
        session.observe("get_page_text", {
          ok: false,
          code: "PAGE_TEXT_UNAVAILABLE",
        });
      if (failure === "batch") session.observe("read_batch", { results: [] });
      if (failure === "overflow")
        for (let i = 0; i < 12; i++) session.observe("read_page", {});
      if (failure === "mutation")
        session.action({ channel: "ui", operation: "click" }, false);
      if (failure === "coverage")
        session.observe("read_page", { truncated: true });
      if (failure === "document")
        session.bind({
          tabId: 1,
          origin: match.origin,
          path: "/",
          snapshot: { ...snapshot, document_epoch: "changed" },
        });
      expect(await session.seal(true)).toBe("INELIGIBLE");
    }
  });
  it("no full-data learning from a visible DOM answer", async () => {
    const { session } = await learned();
    await session.execute(
      {
        ...describeTask,
        arguments: describeTask.arguments.replace('"visible"', '"full"'),
      },
      vi.fn(),
    );
    expect(await session.seal(true)).toBe("INELIGIBLE");
  });
});
