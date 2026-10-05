import { describe, expect, it } from "vitest";
import {
  buildComponentDescriptor,
  describeCoverageGap,
} from "../../../src/page-act-harness/component-descriptor.js";
import {
  maskComponentRows,
  readChannel,
  selectChannel,
} from "../../../src/page-act-harness/component-facade.js";

// PAH-4 unit slice only: descriptor coverage, channel choice, read limits.
// Scroll restoration, adapter wiring, and live model channel selection are
// verified in Chrome + live provider, not here (§12).
const grid = () =>
  buildComponentDescriptor({
    resource_id: "component-aaaaaaaaaaaaa1",
    binding_revision: "epoch-abcdefghijklmnop",
    observed_hint: "grid",
    hint_basis: "role=grid, virtualized rows observed",
    visible_count: 20,
    logical_count: 20,
    has_eof: false,
    channels: [
      { channel: "visible_rows", available: true },
      { channel: "bounded_scroll", available: true },
      {
        channel: "reviewed_data",
        available: false,
        reason: "NO_REVIEWED_ADAPTER",
      },
    ],
    continuation: { cursor: "scroll:20", reason: "VIRTUAL_SCROLL" },
    restoration: "scroll back to offset 0",
    side_effect: "DOM_MUTATION_SCROLL",
  });

describe("PAH-4 component observation", () => {
  it("does_not_fix_strategy_from_the_grid_name_alone", () => {
    const descriptor = grid();
    expect(descriptor.observed_hint_note).toBe("OBSERVED_HINT_ONLY");
    // The model picks the channel; the core never pre-selects by kind name.
    expect(selectChannel(descriptor, "visible_rows").channel).toBe(
      "visible_rows",
    );
    expect(() => selectChannel(descriptor, "reviewed_data")).toThrow(
      "CHANNEL_UNSUPPORTED",
    );
  });

  it("reports_visible_logical_and_unknown_totals_without_overclaim", () => {
    const gap = describeCoverageGap(grid());
    expect(gap).toEqual({ complete: false, reason: "EOF_NOT_OBSERVED" });
    const viewport = readChannel(
      grid(),
      Array.from({ length: 20 }, (_, i) => ({ i })),
      {
        evidence_id: "ev-read-abcdefghijklmnop",
        request_revision: 1,
        channel: "visible_rows",
      },
    );
    expect(viewport.coverage.complete).toBe(false);
    expect(viewport.continuation?.cursor).toBe("scroll:20");
  });

  it("marks_chart_visual_reads_as_estimates_until_an_alt_source_exists", () => {
    const chart = buildComponentDescriptor({
      resource_id: "component-bbbbbbbbbbbbb1",
      binding_revision: "epoch-abcdefghijklmnop",
      observed_hint: "chart",
      hint_basis: "canvas with legend observed",
      visible_count: 1,
      has_eof: true,
      total_count: 1,
      channels: [{ channel: "visual", available: true }],
    });
    const visual = readChannel(chart, [{ series: "a" }], {
      evidence_id: "ev-read-abcdefghijklmnop",
      request_revision: 1,
      channel: "visual",
    });
    expect(visual.coverage.complete).toBe(false);
    expect(visual.limitations.join(" ")).toContain("alt table");
    // Same chart with a value channel available reads values, not estimates.
    const chartWithTable = buildComponentDescriptor({
      resource_id: "component-bbbbbbbbbbbbb1",
      binding_revision: "epoch-abcdefghijklmnop",
      observed_hint: "chart",
      hint_basis: "canvas with auxiliary table observed",
      visible_count: 1,
      logical_count: 1,
      has_eof: true,
      total_count: 1,
      channels: [
        { channel: "visual", available: true },
        { channel: "alt_table", available: true },
      ],
    });
    const values = readChannel(chartWithTable, [{ series: "a" }], {
      evidence_id: "ev-read-abcdefghijklmnop",
      request_revision: 1,
      channel: "alt_table",
    });
    expect(values.coverage.complete).toBe(true);
  });

  it("rejects_unknown_totals_as_zero_and_invalid_counts", () => {
    expect(() =>
      buildComponentDescriptor({
        resource_id: "component-cccccccccccccc1",
        binding_revision: "not-opaque!!!",
        observed_hint: "grid",
        hint_basis: "role=grid observed",
        visible_count: 1,
        has_eof: false,
        channels: [],
      }),
    ).toThrow("BINDING_INVALID");
    expect(() =>
      buildComponentDescriptor({
        resource_id: "component-cccccccccccccc1",
        binding_revision: "epoch-abcdefghijklmnop",
        observed_hint: "grid",
        hint_basis: "",
        visible_count: 1,
        has_eof: false,
        channels: [],
      }),
    ).toThrow("HINT_BASIS_REQUIRED");
  });

  it("keeps_unclassified_components_from_blocking_other_reads", () => {
    const unknown = buildComponentDescriptor({
      resource_id: "component-cccccccccccccc1",
      binding_revision: "epoch-abcdefghijklmnop",
      observed_hint: "unclassified",
      hint_basis: "custom element, no known pattern",
      visible_count: 3,
      has_eof: true,
      total_count: 3,
      channels: [{ channel: "description", available: true }],
    });
    const read = readChannel(unknown, [{ a: 1 }, { a: 2 }, { a: 3 }], {
      evidence_id: "ev-read-abcdefghijklmnop",
      request_revision: 1,
      channel: "description",
    });
    expect(read.coverage.complete).toBe(true);
    expect(read.limitations.join(" ")).toContain("generic");
  });

  it("flags_scroll_side_effects_and_restoration_for_paginated_reads", () => {
    const selection = selectChannel(grid(), "bounded_scroll");
    expect(selection.side_effect).toBe("DOM_MUTATION_SCROLL");
    expect(grid().restoration).toContain("offset 0");
  });

  it("masks_sensitive_fields_instead_of_labeling_raw_rows_masked", () => {
    const masked = maskComponentRows([
      { username: "kim", password: "s3cr3t-value" },
      { note: "api_key=sk-live-abcdef123456" },
      { label: "plain description" },
    ]);
    expect(masked.redacted_count).toBe(2);
    expect(masked.categories).toContain("component-sensitive");
    expect(JSON.stringify(masked.rows)).not.toContain("s3cr3t-value");
    expect(JSON.stringify(masked.rows)).not.toContain("sk-live-abcdef123456");
    const read = readChannel(
      grid(),
      [{ username: "kim", password: "s3cr3t-value" }],
      {
        evidence_id: "ev-read-abcdefghijklmnop",
        request_revision: 1,
        channel: "visible_rows",
      },
    );
    expect(JSON.stringify(read.content)).not.toContain("s3cr3t-value");
    expect(read.masking.redacted_count).toBe(1);
    expect(read.limitations.join(" ")).toContain("redacted");
  });

  it("lets_benign_secret_named_labels_pass_while_catching_values", () => {
    const masked = maskComponentRows([
      { status: "token: expired" },
      { auth: "bearer lowercase-abcdef123456" },
      { next: "https://app.test/cb?code=secret-abc123#frag" },
    ]);
    expect(masked.rows[0]).toEqual({ status: "token: expired" });
    expect(JSON.stringify(masked.rows[1])).not.toContain("lowercase-ab");
    expect(masked.rows[2]).toEqual({
      next: "https://app.test/cb?code=[REDACTED]#frag",
    });
    expect(masked.redacted_count).toBe(2);
  });

  it("redacts_opaque_oauth_values_and_schemeless_queries", () => {
    const masked = maskComponentRows([
      { code: "4/0AZabcdefghijklmnopqrstuvwxyz123456" },
      { next: "/cb?token=secret123" },
      { short: "token=ab" },
      { plain: "?a=b" },
    ]);
    expect(masked.rows[0]).toEqual({ code: "[REDACTED:credential-like]" });
    expect(masked.rows[1]).toEqual({ next: "/cb?token=[REDACTED]" });
    // Short value under a sensitive key is still machine-shaped: redacted.
    expect(masked.rows[2]).toEqual({ short: "[REDACTED:credential-like]" });
    expect(masked.rows[3]).toEqual({ plain: "?a=b" });
    expect(masked.redacted_count).toBe(3);
  });

  it("redacts_nested_values_fragment_secrets_and_repeated_bearers", () => {
    const marker = "ReviewCanaryABC";
    const masked = maskComponentRows([
      { password: [marker] },
      { password: { value: marker } },
      { password: 123456 },
      { label: `https://app.test/path?token=dummy#access_token=${marker}` },
      { label: `Bearer ${marker} and Bearer ${marker}` },
      { label: "https://app.test/ok?a=b#frag" },
    ]);
    const flat = JSON.stringify(masked.rows);
    expect(flat).not.toContain(marker);
    expect(flat).toContain("access_token=[REDACTED]");
    expect(flat).not.toContain("Bearer ReviewCanaryABC");
    expect(flat).toContain("https://app.test/ok?a=b#frag");
    expect(masked.redacted_count).toBeGreaterThanOrEqual(5);
  });

  it("terminates_default_pagination_at_the_last_page", () => {
    const grid550 = buildComponentDescriptor({
      resource_id: "component-dddddddddddddd1",
      binding_revision: "epoch-abcdefghijklmnop",
      observed_hint: "grid",
      hint_basis: "role=grid with pagination observed",
      visible_count: 200,
      logical_count: 550,
      total_count: 550,
      has_eof: true,
      channels: [{ channel: "visible_rows", available: true }],
    });
    const rows = Array.from({ length: 550 }, (_, i) => ({ i }));
    const read = (offset?: number, max_items?: number) =>
      readChannel(grid550, rows, {
        evidence_id: "ev-read-abcdefghijklmnop",
        request_revision: 1,
        channel: "visible_rows",
        ...(offset === undefined ? {} : { offset }),
        ...(max_items === undefined ? {} : { max_items }),
      });
    const first = read();
    expect(first.coverage.complete).toBe(false);
    expect(first.continuation?.cursor).toBe("offset:200");
    const second = read(200);
    expect(second.coverage.complete).toBe(false);
    expect(second.continuation?.cursor).toBe("offset:400");
    const last = read(400);
    expect(last.coverage.complete).toBe(true);
    expect(last.continuation).toBeUndefined();
    expect(last.content).toMatchObject({ rows: rows.slice(400) });
    // Reading exactly at the end completes with zero rows, never loops.
    const empty = read(550);
    expect(empty.coverage.complete).toBe(true);
    expect(empty.continuation).toBeUndefined();
    expect(() =>
      readChannel(grid550, rows, {
        evidence_id: "ev-read-abcdefghijklmnop",
        request_revision: 1,
        channel: "visible_rows",
        offset: 551,
      }),
    ).toThrow("INVALID_OFFSET");
  });

  it("walks_the_full_collection_across_offset_continuations", () => {
    const paged = buildComponentDescriptor({
      resource_id: "component-dddddddddddddd1",
      binding_revision: "epoch-abcdefghijklmnop",
      observed_hint: "grid",
      hint_basis: "role=grid with pagination observed",
      visible_count: 2,
      logical_count: 5,
      total_count: 5,
      has_eof: true,
      channels: [{ channel: "visible_rows", available: true }],
    });
    const rows = [0, 1, 2, 3, 4].map((i) => ({ i }));
    const first = readChannel(paged, rows, {
      evidence_id: "ev-read-abcdefghijklmnop",
      request_revision: 1,
      channel: "visible_rows",
      offset: 0,
      max_items: 2,
    });
    expect(first.content).toMatchObject({ rows: [{ i: 0 }, { i: 1 }] });
    expect(first.coverage.complete).toBe(false);
    expect(first.continuation?.cursor).toBe("offset:2");
    const second = readChannel(paged, rows, {
      evidence_id: "ev-read-abcdefghijklmnop",
      request_revision: 1,
      channel: "visible_rows",
      offset: 2,
      max_items: 2,
    });
    expect(second.content).toMatchObject({ rows: [{ i: 2 }, { i: 3 }] });
    expect(second.continuation?.cursor).toBe("offset:4");
    const third = readChannel(paged, rows, {
      evidence_id: "ev-read-abcdefghijklmnop",
      request_revision: 1,
      channel: "visible_rows",
      offset: 4,
      max_items: 2,
    });
    expect(third.content).toMatchObject({ rows: [{ i: 4 }] });
    expect(third.coverage.complete).toBe(true);
    expect(third.continuation).toBeUndefined();
    expect(() =>
      readChannel(paged, rows, {
        evidence_id: "ev-read-abcdefghijklmnop",
        request_revision: 1,
        channel: "visible_rows",
        offset: -1,
      }),
    ).toThrow("INVALID_OFFSET");
  });
});
