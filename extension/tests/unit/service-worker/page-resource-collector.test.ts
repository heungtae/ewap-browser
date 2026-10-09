import { afterEach, describe, expect, it, vi } from "vitest";
import { createPageResourceCollector } from "../../../src/content/page-resources.js";
import type { PageResourceInventory } from "../../../src/contracts/page-resource-types.js";

const setup = (src = "") => {
  const node = {
    src,
    textContent: "function unknownStaticFunction() { return 23; }",
  };
  const doc = {
    scripts: [node],
    URL: "https://fixture.test/view",
    baseURI: "https://fixture.test/view",
    title: "Report",
    querySelector: () => null,
  };
  const collector = createPageResourceCollector(
    doc as unknown as Document,
    "epoch",
  );
  const inventory = () =>
    collector.handle({
      kind: "CONTENT_PAGE_RESOURCES",
      document_epoch: "epoch",
    }) as Promise<PageResourceInventory>;
  return { node, collector, inventory };
};
afterEach(() => vi.unstubAllGlobals());
describe("S16 content source collector", () => {
  it("lists opaque metadata and changes revision when inline source changes", async () => {
    const test = setup();
    const first = await test.inventory();
    expect(JSON.stringify(first)).not.toContain("unknownStaticFunction");
    expect(first.items[1]?.kind).toBe("inline_script");
    test.node.textContent += "\n// updated";
    const next = await test.inventory();
    expect(next.revision).not.toBe(first.revision);
    expect(next.items[1]?.resource_id).toBe(first.items[1]?.resource_id);
    expect(
      await test.collector.handle({
        kind: "CONTENT_PAGE_RESOURCE_READ",
        document_epoch: "epoch",
        inventory_revision: first.revision,
        resource_id: first.items[1]?.resource_id,
        source_consent: true,
      }),
    ).toEqual({ status: "STALE" });
  });
  it("withholds source without consent and refuses another document epoch", async () => {
    const test = setup();
    const data = await test.inventory();
    expect(
      await test.collector.handle({
        kind: "CONTENT_PAGE_RESOURCE_READ",
        document_epoch: "epoch",
        inventory_revision: data.revision,
        resource_id: data.items[1]?.resource_id,
      }),
    ).toEqual({ status: "CONSENT_REQUIRED" });
    expect(
      await test.collector.handle({
        kind: "CONTENT_PAGE_RESOURCES",
        document_epoch: "other",
      }),
    ).toEqual({ status: "STALE" });
  });
  it.each([
    "https://other.test/source.js",
    "https://fixture.test/source.js?token=secret",
    "https://user:pass@fixture.test/source.js",
    "data:text/javascript,alert(1)",
  ])("does not fetch unavailable URL %s", async (src) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const test = setup(src);
    const data = await test.inventory();
    expect(data.items[1]?.readable).toBe(false);
    expect(JSON.stringify(data)).not.toContain(src);
    expect(
      await test.collector.handle({
        kind: "CONTENT_PAGE_RESOURCE_READ",
        document_epoch: "epoch",
        inventory_revision: data.revision,
        resource_id: data.items[1]?.resource_id,
        source_consent: true,
      }),
    ).toEqual({ status: "UNSUPPORTED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fetches approved same-origin source without credentials or redirect following", async () => {
    const fetcher = vi.fn(
      async () => new Response("function externalHelper() {}"),
    );
    vi.stubGlobal("fetch", fetcher);
    const test = setup("https://fixture.test/source.js");
    const data = await test.inventory();
    expect(data.items[1]?.byte_length).toBe(null);
    expect(
      await test.collector.handle({
        kind: "CONTENT_PAGE_RESOURCE_READ",
        document_epoch: "epoch",
        inventory_revision: data.revision,
        resource_id: data.items[1]?.resource_id,
        source_consent: true,
      }),
    ).toMatchObject({
      status: "AVAILABLE",
      body: "function externalHelper() {}",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://fixture.test/source.js",
      expect.objectContaining({
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      }),
    );
  });
  it("rejects oversized inline and streamed external sources", async () => {
    const test = setup();
    test.node.textContent = "x".repeat(1024 * 1024 + 1);
    expect((await test.inventory()).items[1]?.readable).toBe(false);
    const external = setup("https://fixture.test/source.js");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(1024 * 1024 + 1))),
    );
    const data = await external.inventory();
    expect(
      await external.collector.handle({
        kind: "CONTENT_PAGE_RESOURCE_READ",
        document_epoch: "epoch",
        inventory_revision: data.revision,
        resource_id: data.items[1]?.resource_id,
        source_consent: true,
      }),
    ).toEqual({ status: "UNSUPPORTED" });
  });
});
