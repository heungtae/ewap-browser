import { describe, it, expect, vi } from "vitest";
import { createLearnedSession } from "../../../src/learned-profile/session.js";
import { setup, receipt, match, task, snapshot } from "./helpers.js";
import { STORAGE_KEY } from "../../../src/learned-profile/types.js";
import { readLearnedCatalog } from "../../../src/learned-profile/catalog-codec.js";
import { commandFor } from "../../../src/learned-profile/command-definition.js";
async function prepare() {
  const s = setup();
  await s.store.commit(await receipt(s.store));
  const ticket = (await s.store.lookup(match))!;
  const session = createLearnedSession({
    ticket,
    store: s.store,
    mode: "ask",
    snapshot,
    current: () => true,
  });
  const describeTask = {
    name: "describe_learned_task",
    arguments: JSON.stringify({
      ...task,
      mode: undefined,
      recipe_id: ticket.profile!.recipes[0]!.recipe_id,
    }),
  };
  await session.execute(describeTask, vi.fn());
  return { ...s, session, ticket };
}
describe("learned repair and storage recovery", () => {
  it("returns original failure, isolates the consumed recipe and upgrades only after alternate success", async () => {
    const { store, session, ticket } = await prepare();
    session.observe("get_page_text", {
      status: "FAILED",
      code: "PAGE_TEXT_UNAVAILABLE",
    });
    session.observe("read_page", { nodes: [], truncated: false });
    expect(await session.seal(true)).toBe("SAVED");
    const p = (await store.snapshot()).records[0]!;
    expect(p.profile_id).toBe(ticket.profile!.profile_id);
    expect(p.recipes[0]!.history.map((h) => h.kind)).toEqual([
      "success",
      "failure",
      "repair",
    ]);
    expect(p.commands[0]!.revision).toBe(2);
  });
  it("a second failure, initial failure before selection, or unknown mutation blocks repair", async () => {
    const { session } = await prepare();
    session.observe("get_page_text", { status: "FAILED" });
    session.observe("read_page", { status: "FAILED" });
    expect(await session.seal(true)).toBe("INELIGIBLE");
    const { store } = setup();
    const fresh = createLearnedSession({
      ticket: (await store.lookup(match))!,
      store,
      mode: "ask",
      snapshot,
      current: () => true,
    });
    fresh.observe("get_page_text", { status: "FAILED" });
    await fresh.execute(
      {
        name: "describe_learned_task",
        arguments: JSON.stringify({ ...task, mode: undefined }),
      },
      vi.fn(),
    );
    expect(await fresh.seal(true)).toBe("INELIGIBLE");
    const unknown = await prepare();
    unknown.session.action({ channel: "ui", operation: "click" }, false);
    expect(await unknown.session.seal(true)).toBe("INELIGIBLE");
  });
  it("auto-update off allows request-local fallback while retaining the quarantined prior recipe", async () => {
    const { store, ticket } = await prepare();
    await store.manage(
      ticket.catalog_revision,
      "update",
      ticket.profile!.profile_id,
      { auto_update: false },
    );
    const renewedTicket = (await store.lookup(match))!;
    const s = createLearnedSession({
      ticket: renewedTicket,
      store,
      mode: "ask",
      snapshot,
      current: () => true,
    });
    await s.execute({ name: "page_cmd_0", arguments: "{}" }, async () => ({
      status: "FAILED",
      code: "READ_FAILED",
    }));
    s.observe("read_page", { nodes: [] });
    expect(await s.seal(true)).toBe("DISCARDED");
    const r = (await store.snapshot()).records[0]!.recipes[0]!;
    expect(r.revision).toBe(1);
    expect(r.lifecycle).toBe("quarantined");
  });
  it("does not replace a disabled page with a new enabled profile", async () => {
    const { store, ticket } = await prepare();
    await store.manage(
      ticket.catalog_revision,
      "update",
      ticket.profile!.profile_id,
      { enabled: false },
    );
    const next = (await store.lookup(match))!;
    expect(store.validRecipes(next, "ask")).toEqual([]);
    expect(await store.commit(await receipt(store))).toBe("DISCARDED");
    expect((await store.snapshot()).records).toHaveLength(1);
  });
  it("recovers committed records on restart, rejects corrupt records and supports missing legacy commands", async () => {
    const { store, data } = await prepare();
    const c = await store.snapshot(),
      p = c.records[0]!;
    const old = { ...p } as Record<string, unknown>;
    delete old.commands;
    const recovered = readLearnedCatalog({
      ...c,
      records: [old, { raw_prompt: "private" }],
    });
    expect(recovered.records).toHaveLength(1);
    expect(recovered.records[0]!.commands).toEqual([]);
    expect(readLearnedCatalog(data[STORAGE_KEY]).records[0]!.profile_id).toBe(
      p.profile_id,
    );
    expect(() =>
      readLearnedCatalog({ schema_version: 2, records: [] }),
    ).toThrow();
  });
  it("does not preserve command identity when an effect changes", async () => {
    const { ticket } = await prepare();
    const r = ticket.profile!.recipes[0]!,
      c = ticket.profile!.commands[0]!;
    expect(
      commandFor(
        {
          ...r,
          task: { ...r.task, mode: "act" },
          steps: [{ channel: "ui", operation: "click" }],
        },
        c.namespace,
        c,
      ),
    ).toBeUndefined();
  });
});
