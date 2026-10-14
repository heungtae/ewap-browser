import { it, expect } from "vitest";
import { createLearnedIdentity } from "../../../src/learned-profile/identity.js";
import { setup, snapshot } from "./helpers.js";
it("keys the entire URL and observable context with a persistent trusted-context HMAC key", async () => {
  const { storage, data } = setup();
  const identity = createLearnedIdentity(storage);
  const page = {
    tabId: 1,
    origin: "https://example.test",
    url: "https://example.test/private?account=alice#secret",
    path: "/private",
    snapshot,
  };
  const a = (await identity.match(page))!;
  expect(await createLearnedIdentity(storage).match(page)).toEqual(a);
  for (const url of [
    page.url.replace("alice", "bob"),
    page.url.replace("secret", "different"),
    page.url.replace("private", "other"),
  ])
    expect((await identity.match({ ...page, url }))!.page_key).not.toBe(
      a.page_key,
    );
  expect(
    (await identity.match({
      ...page,
      snapshot: { ...snapshot, visible_text: "account two" },
    }))!.context_guard,
  ).not.toBe(a.context_guard);
  expect(
    await identity.match({
      ...page,
      snapshot: { ...snapshot, truncated: true },
    }),
  ).toBeUndefined();
  expect(JSON.stringify(data)).not.toContain("alice");
  expect(JSON.stringify(a)).not.toContain("secret");
});
