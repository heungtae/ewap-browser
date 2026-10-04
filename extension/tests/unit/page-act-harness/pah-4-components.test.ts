import { describe, expect, it } from "vitest";
import {
  buildComponentDescriptor,
  describeCoverageGap,
} from "../../../src/page-act-harness/component-descriptor.js";
import {
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
});
