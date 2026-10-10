import { describe, expect, it } from "vitest";
import { componentDomChannel } from "../../../src/service-worker/component-dom-channel.js";
import { buildComponentDescriptor } from "../../../src/page-act-harness/component-descriptor.js";
const descriptor = () =>
  buildComponentDescriptor({
    resource_id: "component-abcdefghijklmnop",
    binding_revision: "revision-abcdefghijklmnop",
    observed_hint: "chart",
    hint_basis: "role:img",
    visible_count: 0,
    has_eof: false,
    channels: [{ channel: "alt_table", available: true }],
  });
describe("S19 channel selection", () => {
  it("keeps mounted subtree rows separate from clipped visible rows", () => {
    expect(
      componentDomChannel(
        { rows: ["visible"], subtree_rows: ["visible", "off viewport"] },
        descriptor(),
        "subtree",
      ),
    ).toEqual(["visible", "off viewport"]);
  });
  it("uses an explicitly associated table without treating chart pixels as source values", () => {
    const input = descriptor();
    expect(
      componentDomChannel(
        { alternative: { rows: [1, 2], has_eof: true, total_count: 2 } },
        input,
        "alt_table",
      ),
    ).toEqual([1, 2]);
    expect(input).toMatchObject({
      observed_hint: "chart",
      logical_count: 2,
      total_count: 2,
      has_eof: true,
    });
    expect(() => componentDomChannel({}, descriptor(), "alt_table")).toThrow(
      "ALTERNATIVE_UNAVAILABLE",
    );
  });
});
