import { describe, it, expect } from "vitest";
import { setup, receipt, match, task } from "./helpers.js";
import { TTL, STORAGE_KEY } from "../../../src/learned-profile/types.js";
import { validateProfile } from "../../../src/learned-profile/validation.js";
describe("local learned profile transactions", () => {
  it("defaults on, learns once, persists no URL/value/evidence identifiers", async () => {
    const { store, data } = setup();
    const r = await receipt(store);
    expect(await store.commit(r)).toBe("SAVED");
    expect(await store.commit(r)).toBe("DISCARDED");
    const c = await store.snapshot();
    expect(c.enabled).toBe(true);
    expect(c.records).toHaveLength(1);
    expect(c.records[0]!.commands[0]!.recipe_revision).toBe(1);
    const raw = JSON.stringify(data[STORAGE_KEY]);
    for (const forbidden of [
      "document_epoch",
      "model_ref",
      "prompt",
      "visible_text",
      "arguments",
      "https://example.test/",
    ])
      expect(raw).not.toContain(forbidden);
  });
  it.each(["delete", "clear", "update", "rediscover"] as const)(
    "does not resurrect after %s",
    async (operation) => {
      const { store } = setup();
      await store.commit(await receipt(store));
      const r = await receipt(store);
      await store.manage(
        r.ticket.catalog_revision,
        operation,
        r.ticket.profile!.profile_id,
        { enabled: false },
      );
      expect(await store.commit(r)).toBe("DISCARDED");
    },
  );
  it("off retains records and rejects in-flight learning; on preserves settings", async () => {
    const { store } = setup();
    await store.commit(await receipt(store));
    const r = await receipt(store);
    await store.manage(r.ticket.catalog_revision, "feature", undefined, {
      enabled: false,
    });
    expect(await store.lookup(match)).toBeUndefined();
    expect(await store.commit(r)).toBe("DISCARDED");
    const c = await store.snapshot();
    expect(c.records).toHaveLength(1);
    await store.manage(c.catalog_revision, "feature", undefined, {
      enabled: true,
    });
    expect(await store.lookup(match)).toBeDefined();
  });
  it("expires from success, separates scope/context/structure, never extends TTL on lookup", async () => {
    const { store, advance } = setup();
    await store.commit(await receipt(store));
    const ticket = (await store.lookup(match))!;
    expect(store.validRecipes(ticket, "ask")).toHaveLength(1);
    expect(store.validRecipes(ticket, "act")).toHaveLength(0);
    expect(
      (await store.lookup({ ...match, context_guard: "d".repeat(64) }))!
        .profile,
    ).toBeUndefined();
    expect(
      store.validRecipes(
        { ...ticket, match: { ...match, structure_guard: "e".repeat(64) } },
        "ask",
      ),
    ).toHaveLength(0);
    advance(TTL + 1);
    expect(store.validRecipes(ticket, "ask")).toHaveLength(0);
  });
  it("serializes competing tab commits", async () => {
    const { store } = setup();
    const a = await receipt(store),
      b = await receipt(store);
    expect(await Promise.all([store.commit(a), store.commit(b)])).toEqual([
      "SAVED",
      "DISCARDED",
    ]);
    expect((await store.snapshot()).records).toHaveLength(1);
  });
  it("isolates consumed recipe failure, atomically repairs its linked command and retains history", async () => {
    const { store } = setup();
    await store.commit(await receipt(store));
    await store.commit(
      await receipt(store, { ...task, kind: "search", input: "text" }),
    );
    const original = (await store.snapshot()).records[0]!,
      selected = original.recipes[0]!;
    const ticket = (await store.lookup(match))!;
    const repair = await store.feedback(ticket, selected.recipe_id);
    expect(repair!.profile!.recipes[0]!.lifecycle).toBe("quarantined");
    expect(repair!.profile!.recipes[1]!.lifecycle).toBe("active");
    const r = await receipt(store);
    r.ticket = repair!;
    r.task = selected.task;
    r.consumed_recipe = selected.recipe_id;
    expect(await store.commit(r)).toBe("SAVED");
    const p = (await store.snapshot()).records[0]!;
    const renewed = p.recipes.find((x) => x.recipe_id === selected.recipe_id)!;
    expect(renewed.history.map((h) => h.kind)).toEqual([
      "success",
      "failure",
      "repair",
    ]);
    expect(
      p.commands.find((c) => c.recipe_id === renewed.recipe_id)!.command_id,
    ).toBe(
      original.commands.find((c) => c.recipe_id === renewed.recipe_id)!
        .command_id,
    );
    expect(
      p.commands.find((c) => c.recipe_id === renewed.recipe_id)!
        .recipe_revision,
    ).toBe(renewed.revision);
  });
  it("does not update disabled auto-update recipes or accept raw fields", async () => {
    const { store } = setup();
    await store.commit(await receipt(store));
    const r = await receipt(store);
    const p = r.ticket.profile!;
    await store.manage(r.ticket.catalog_revision, "update", p.profile_id, {
      recipe_id: p.recipes[0]!.recipe_id,
      auto_update: false,
    });
    expect(await store.commit(await receipt(store))).toBe("DISCARDED");
    expect(() => validateProfile({ ...p, raw_prompt: "private" })).toThrow();
  });
  it("enforces five recipes per page", async () => {
    const { store } = setup();
    for (const kind of [
      "help",
      "search",
      "table-read",
      "navigate",
      "form",
    ] as const)
      expect(await store.commit(await receipt(store, { ...task, kind }))).toBe(
        "SAVED",
      );
    expect(
      await store.commit(await receipt(store, { ...task, kind: "method" })),
    ).toBe("CAPACITY");
  });
});
