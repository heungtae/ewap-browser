import type { DataAdapter, DataAdapterResultSchema } from "./index.js";

const FIXTURE_ORIGIN = "https://collection-read-fixture.invalid";

export const fixtureDataAdapter: DataAdapter = {
  adapter_id: "fixture_collection_v1",
  version: 1,
  origins: [FIXTURE_ORIGIN],

  matchesDescriptor(descriptor): boolean {
    return (
      descriptor.object_kind === "table" &&
      descriptor.container_xpath.includes("collection-fixture") &&
      descriptor.roles.includes("grid")
    );
  },

  async readWindow(
    descriptor,
    cursor?: string,
  ): Promise<{
    records: readonly {
      index: number;
      cells: readonly string[];
      row_id?: string;
      aria_row_index?: number;
      aria_pos_in_set?: number;
      aria_set_size?: number;
    }[];
    cursor?: string;
    has_more: boolean;
    total?: number;
    eof: boolean;
  }> {
    const pageSize = 50;
    const totalRecords = 200;

    let startIndex = 0;
    if (cursor) {
      try {
        const parsed = JSON.parse(atob(cursor));
        startIndex = parsed.offset ?? 0;
      } catch {
        startIndex = 0;
      }
    }

    const endIndex = Math.min(startIndex + pageSize, totalRecords);
    const records = [];

    for (let i = startIndex; i < endIndex; i++) {
      records.push({
        index: i,
        cells: [
          `Row ${i + 1} Col 1`,
          `Row ${i + 1} Col 2`,
          `Row ${i + 1} Col 3`,
        ],
        row_id: `row-${i}`,
        aria_row_index: i + 1,
        aria_pos_in_set: i + 1,
        aria_set_size: totalRecords,
      });
    }

    const nextCursor =
      endIndex < totalRecords
        ? btoa(JSON.stringify({ offset: endIndex }))
        : undefined;

    const result: {
      records: readonly {
        index: number;
        cells: readonly string[];
        row_id?: string;
        aria_row_index?: number;
        aria_pos_in_set?: number;
        aria_set_size?: number;
      }[];
      has_more: boolean;
      total: number;
      eof: boolean;
      cursor?: string;
    } = {
      records: records as readonly {
        index: number;
        cells: readonly string[];
        row_id?: string;
        aria_row_index?: number;
        aria_pos_in_set?: number;
        aria_set_size?: number;
      }[],
      has_more: endIndex < totalRecords,
      total: totalRecords,
      eof: endIndex >= totalRecords,
    };
    if (nextCursor !== undefined) {
      result.cursor = nextCursor;
    }
    return result;
  },

  resultSchema: {
    records: [],
    has_more: false,
    total: 0,
    eof: false,
  } as DataAdapterResultSchema,
};
