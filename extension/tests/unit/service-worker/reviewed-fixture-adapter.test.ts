import { describe, expect, it } from "vitest";
import type { CollectionReadDescriptor } from "../../../src/contracts/collection-read-types.js";
import { CollectionReaderRegistry } from "../../../src/service-worker/collection-reader-registry.js";
import { reviewedFixtureCollectionAdapter } from "../../../src/service-worker/reviewed-fixture-adapter.js";

const descriptor: CollectionReadDescriptor = {
  collection_ref: "fixture-ref",
  object_kind: "table",
  container_selector: "",
  container_xpath: "/html/body/main/table[@id='collection-fixture']",
  container_rect: { x: 0, y: 0, width: 640, height: 400 },
  estimated_total: 200,
  has_virtual_scroll: false,
  has_pagination: false,
  aria_attributes: {},
  roles: ["grid"],
  sample_row_count: 1,
  sample_rows: [],
};

describe("reviewed fixture collection adapter", () => {
  it("is selected only for its reviewed origin and exact path", () => {
    const registry = new CollectionReaderRegistry();
    registry.registerAdapter(reviewedFixtureCollectionAdapter);

    expect(
      registry.selectRoute(
        descriptor,
        "https://collection-read-fixture.invalid/collection-fixture",
      ),
    ).toMatchObject({
      kind: "reviewed_adapter",
      adapter: reviewedFixtureCollectionAdapter,
    });
    expect(
      registry.selectRoute(
        descriptor,
        "https://collection-read-fixture.invalid/other",
      ),
    ).toEqual({ kind: "content_static" });
  });

  it("returns bounded stable-ID windows with total and EOF evidence", async () => {
    const first = await reviewedFixtureCollectionAdapter.readWindow(descriptor);
    expect(first.window.records).toHaveLength(50);
    expect(first.window.records[0]).toMatchObject({
      index: 0,
      row_id: "row-0",
      aria_row_index: 1,
      aria_set_size: 200,
    });
    expect(first.window).toMatchObject({
      has_more: true,
      evidence: { eof_observed: false, adapter_total: 200 },
    });

    const final = await reviewedFixtureCollectionAdapter.readWindow(
      descriptor,
      first.window.cursor,
    );
    expect(final.window.records).toHaveLength(50);
    expect(final.window.records[0]?.row_id).toBe("row-50");
    expect(final.window).toMatchObject({
      has_more: true,
      evidence: { eof_observed: false, adapter_total: 200 },
    });

    let cursor = final.window.cursor;
    let last = final;
    while (last.window.has_more) {
      last = await reviewedFixtureCollectionAdapter.readWindow(
        descriptor,
        cursor,
      );
      cursor = last.window.cursor;
    }
    expect(last.window.records[0]?.row_id).toBe("row-150");
    expect(last.window).toMatchObject({
      has_more: false,
      evidence: { eof_observed: true, adapter_total: 200 },
    });
  });
});
