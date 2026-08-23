import { describe, expect, it } from "vitest";
import { semanticFingerprint } from "../../../src/profile/fingerprint.js";
import {
  recordCandidate,
  recordMatchesPage,
  validateWorkflowCatalogState,
} from "../../../src/contracts/workflow-catalog.js";

const snapshot = {
  schema_version: 2 as const,
  document_epoch: "abcdefghijklmnop",
  frame_id: 0,
  visible_text: "",
  nodes: [
    {
      ref_id: "product-abcdefghijklmnop",
      role: "combobox" as const,
      name: "제품군",
      state: {},
      visible: true,
      enabled: true,
    },
  ],
};
const stored = () => ({
  id: "abcdefghijklmnop",
  title: "내 수율 분석",
  enabled: true,
  origin: "https://demo.example.test",
  path_prefix: "/trend",
  fingerprint: semanticFingerprint(snapshot).fingerprint,
  created_at: "2026-08-23T00:00:00.000Z",
  updated_at: "2026-08-23T00:00:00.000Z",
  declaration: {
    schema_version: 1,
    id: "yield-v1",
    title: "수율 분석",
    steps: [
      {
        id: "product",
        tool: "select_option_by_ref",
        target: { role: "combobox", name: "제품군" },
      },
    ],
  },
});

describe("saved workflow catalog", () => {
  it("keeps only declarative metadata and matches a current page fingerprint", () => {
    const catalog = validateWorkflowCatalogState({
      schema_version: 1,
      records: [stored()],
    });
    const item = catalog.records[0]!;

    expect(
      recordMatchesPage(
        item,
        "https://demo.example.test",
        "/trend/view",
        snapshot,
      ),
    ).toBe(true);
    expect(recordCandidate(item, "verified")).toMatchObject({
      source: "recorded",
      status: "verified",
      step_count: 1,
    });
  });

  it("marks a record unavailable when the semantic page structure changes", () => {
    const item = validateWorkflowCatalogState({
      schema_version: 1,
      records: [stored()],
    }).records[0]!;
    expect(
      recordMatchesPage(item, "https://demo.example.test", "/trend", {
        ...snapshot,
        nodes: [{ ...snapshot.nodes[0]!, role: "button" as const }],
      }),
    ).toBe(false);
  });

  it("rejects raw values and unknown persisted fields", () => {
    expect(() =>
      validateWorkflowCatalogState({
        schema_version: 1,
        records: [{ ...stored(), raw_html: "<input value=secret>" }],
      }),
    ).toThrow("INVALID_ARGUMENT");
  });
});
