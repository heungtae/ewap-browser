import { describe, expect, it } from "vitest";
import { CollectionReaderRegistry } from "../../../src/service-worker/collection-reader-registry.js";
import type {
  CollectionReadDescriptor,
  CollectionReaderAdapter,
} from "../../../src/contracts/collection-read-types.js";

const descriptor: CollectionReadDescriptor = {
  collection_ref: "ref",
  object_kind: "pagination",
  container_selector: "",
  container_xpath: "/body/main",
  container_rect: { x: 0, y: 0, width: 1, height: 1 },
  has_virtual_scroll: false,
  has_pagination: true,
  aria_attributes: {},
  roles: [],
  sample_row_count: 0,
  sample_rows: [],
};

const adapter: CollectionReaderAdapter = {
  adapter_id: "fixture-pagination-v1",
  version: 1,
  origins: ["https://fixture.invalid"],
  paths: ["/inventory"],
  resultSchema: { type: "collection_read_v1", additionalProperties: false },
  matchesDescriptor: (value) => value.object_kind === "pagination",
  readWindow: async () => ({
    window: {
      records: [],
      has_more: false,
      evidence: {
        stable_ids: [],
        aria_indices: [],
        aria_set_sizes: [],
        eof_observed: true,
      },
    },
  }),
};

describe("CollectionReaderRegistry", () => {
  it("selects pagination only through an exact reviewed origin and pathname", () => {
    const registry = new CollectionReaderRegistry();
    registry.registerAdapter(adapter);
    expect(
      registry.selectRoute(descriptor, "https://fixture.invalid/inventory"),
    ).toMatchObject({ kind: "reviewed_adapter", adapter });
    expect(
      registry.selectRoute(descriptor, "https://fixture.invalid/other"),
    ).toEqual({ kind: "unavailable" });
  });

  it("rejects an adapter whose result schema is not closed", () => {
    const registry = new CollectionReaderRegistry();
    expect(() =>
      registry.registerAdapter({
        ...adapter,
        resultSchema: {
          type: "collection_read_v1",
          additionalProperties: true,
        } as never,
      }),
    ).toThrow("INVALID_COLLECTION_ADAPTER");
  });
});
