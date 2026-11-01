import { expect, it } from "vitest";
import { PanelOwners } from "../../../../../apps/chrome-extension/src/bridge/panel-owner.js";
const id = "a".repeat(32);
function fixture() {
  const owners = new PanelOwners(id);
  const owner = owners.issue({ id: 7, windowId: 4 });
  const sender = { id, url: owner.url, origin: `chrome-extension://${id}` };
  const context = {
    contextType: "SIDE_PANEL",
    documentUrl: owner.url,
    documentId: "doc",
    windowId: -1,
  };
  const tab = async () => ({ id: 7, windowId: 4 });
  return { owners, owner, sender, context, tab };
}
it("resolves only a fresh Worker-issued panel address against a live tab and unique context", async () => {
  const { owners, owner, sender, context, tab } = fixture();
  expect(await owners.resolve(sender, async () => [context], tab)).toEqual({
    tabId: 7,
    windowId: 4,
    url: owner.url,
    documentId: "doc",
  });
  for (const patch of [
    { id: "b".repeat(32) },
    { documentId: "stale" },
    { origin: "https://foreign.test" },
    { tab: { id: 8 } },
    { url: owner.url + "#copy" },
  ])
    expect(
      await owners.resolve({ ...sender, ...patch }, async () => [context], tab),
    ).toBeNull();
  for (const contexts of [
    [],
    [context, context],
    [{ ...context, contextType: "TAB" }],
    [
      {
        contextType: "SIDE_PANEL",
        documentUrl: context.documentUrl,
        windowId: -1,
      },
    ],
    [{ ...context, windowId: 5 }],
  ])
    expect(await owners.resolve(sender, async () => contexts, tab)).toBeNull();
  expect(
    await owners.resolve(
      sender,
      async () => [context],
      async () => ({ id: 7, windowId: 5 }),
    ),
  ).toBeNull();
  expect(
    await owners.resolve(
      sender,
      async () => [context],
      async () => {
        throw Error("gone");
      },
    ),
  ).toBeNull();
});
it("revokes closed/moved tabs, rotated addresses, Worker restarts and in-flight resolutions", async () => {
  const { owners, sender, context, tab } = fixture();
  expect(
    await new PanelOwners(id).resolve(sender, async () => [context], tab),
  ).toBeNull();
  const second = owners.issue({ id: 8, windowId: 5 });
  expect(second.url).not.toBe(sender.url);
  expect(
    await owners.resolve(sender, async () => [context], tab),
  ).not.toBeNull();
  expect(
    await owners.resolve(
      sender,
      async () => {
        owners.revoke(7);
        return [context];
      },
      tab,
    ),
  ).toBeNull();
  const next = owners.issue({ id: 7, windowId: 4 });
  expect(next.url).not.toBe(sender.url);
  expect(await owners.resolve(sender, async () => [context], tab)).toBeNull();
});
it("bounds owner allocations and rejects invalid Chrome event scope", () => {
  const owners = new PanelOwners(id);
  expect(() => owners.issue({ windowId: 1 })).toThrow("PANEL_TAB");
  expect(() => owners.issue({ id: 0, windowId: -1 })).toThrow("PANEL_TAB");
  for (let n = 0; n < 256; n++) owners.issue({ id: n, windowId: 1 });
  expect(() => owners.issue({ id: 256, windowId: 1 })).toThrow(
    "PANEL_OWNER_LIMIT",
  );
  owners.revoke(0);
  expect(() => owners.issue({ id: 256, windowId: 1 })).not.toThrow();
});
