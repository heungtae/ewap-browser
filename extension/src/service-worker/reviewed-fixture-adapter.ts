import type {
  CollectionReadDescriptor,
  CollectionReaderAdapter,
} from "../contracts/collection-read-types.js";
import { fixtureDataAdapter } from "../page-api/data-adapters/fixture.js";

/** Controlled public-data fixture used to exercise the reviewed adapter route. */
export const reviewedFixtureCollectionAdapter: CollectionReaderAdapter = {
  adapter_id: "fixture_collection_v1",
  version: 1,
  origins: ["https://collection-read-fixture.invalid"],
  paths: ["/collection-fixture"],
  resultSchema: {
    type: "collection_read_v1",
    additionalProperties: false,
  },
  matchesDescriptor(descriptor: CollectionReadDescriptor): boolean {
    return fixtureDataAdapter.matchesDescriptor(descriptor);
  },
  async readWindow(descriptor, cursor) {
    const result = await fixtureDataAdapter.readWindow(
      descriptor as Parameters<typeof fixtureDataAdapter.readWindow>[0],
      cursor,
    );
    const records = result.records.map((record) => ({
      ...record,
      row_id: record.row_id ?? `fixture-row-${record.index}`,
    }));
    return {
      window: {
        records,
        ...(result.cursor === undefined ? {} : { cursor: result.cursor }),
        has_more: result.has_more,
        evidence: {
          stable_ids: records.map((record) => record.row_id!),
          aria_indices: records.flatMap((record) =>
            record.aria_row_index === undefined ? [] : [record.aria_row_index],
          ),
          aria_set_sizes: records.flatMap((record) =>
            record.aria_set_size === undefined ? [] : [record.aria_set_size],
          ),
          eof_observed: result.eof,
          adapter_cursor: result.cursor,
          adapter_total: result.total,
          total_hint: result.total,
        },
      },
    };
  },
};
