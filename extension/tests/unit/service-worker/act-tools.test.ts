import { describe, expect, it } from "vitest";
import type { SemanticSnapshot } from "../../../src/contracts/types.js";
import { genericActTools } from "../../../src/service-worker/act-tools.js";

const snapshot: SemanticSnapshot = {
  schema_version: 2,
  document_epoch: "abcdefghijklmnop",
  frame_id: 0,
  nodes: [
    {
      ref_id: "company-link-abcdefghijk",
      role: "link",
      name: "기업 소개",
      state: {},
      visible: true,
      enabled: true,
      same_origin_link: true,
    },
    {
      ref_id: "analysis-link-abcdefghij",
      role: "link",
      name: "수율 분석 센터",
      state: {},
      visible: true,
      enabled: true,
      same_origin_link: true,
    },
  ],
  visible_text: "",
};

describe("generic Act tools", () => {
  it("gives navigation one function with only current opaque link refs as targets", () => {
    const tools = genericActTools(
      [
        {
          tool: "navigate",
          effect: "local-ui-only",
          risk: "R1",
          eligible_roles: ["link"],
          verifier: {
            kind: "semantic-state-transition",
            declaration_id: "test",
            pre_state_digest: "",
            required_changes: [],
          },
        },
      ],
      {
        document_epoch: snapshot.document_epoch,
        frame_id: 0,
        nodes: snapshot.nodes.map((node, index) => ({
          ...node,
          model_ref: `model-ref-${index}-abcdefghijkl`,
        })),
        visible_text: "",
      },
      snapshot,
    );

    expect(tools).toHaveLength(1);
    expect(tools[0]?.function.parameters).toMatchObject({
      properties: {
        target: {
          enum: ["model-ref-0-abcdefghijkl", "model-ref-1-abcdefghijkl"],
        },
        approval_scope: { enum: ["single_step", "session"] },
        approval_reason: { type: "string" },
      },
    });
    expect(tools[0]?.function.parameters.required).toEqual([
      "target",
      "approval_scope",
      "approval_reason",
    ]);
  });

  it("limits a workflow step to its current target", () => {
    const tools = genericActTools(
      [
        {
          tool: "navigate",
          effect: "local-ui-only",
          risk: "R1",
          eligible_roles: ["link"],
          verifier: {
            kind: "semantic-state-transition",
            declaration_id: "test",
            pre_state_digest: "",
            required_changes: [],
          },
        },
      ],
      {
        document_epoch: snapshot.document_epoch,
        frame_id: 0,
        nodes: snapshot.nodes.map((node, index) => ({
          ...node,
          model_ref: `model-ref-${index}-abcdefghijkl`,
        })),
        visible_text: "",
      },
      snapshot,
      new Set(["analysis-link-abcdefghij"]),
    );

    expect(tools[0]?.function.parameters).toMatchObject({
      properties: { target: { enum: ["model-ref-1-abcdefghijkl"] } },
    });
  });

  it("offers only custom listbox options to the click tool", () => {
    const listbox = {
      ref_id: "listbox-abcdefghijklmnop",
      role: "listbox" as const,
      name: "Variant choices",
      state: {},
      visible: true,
      enabled: true,
    };
    const option = {
      ref_id: "option-low-abcdefghijkl",
      role: "option" as const,
      name: "low",
      state: { selected: false },
      visible: true,
      enabled: true,
      parent_ref_id: listbox.ref_id,
    };
    const customSnapshot = { ...snapshot, nodes: [listbox, option] };
    const tools = genericActTools(
      [
        {
          tool: "click_by_ref",
          effect: "local-ui-only",
          risk: "R1",
          eligible_roles: ["option"],
          verifier: {
            kind: "semantic-state-transition",
            declaration_id: "custom-option",
            pre_state_digest: "",
            required_changes: [],
          },
        },
      ],
      {
        document_epoch: customSnapshot.document_epoch,
        frame_id: customSnapshot.frame_id,
        nodes: customSnapshot.nodes.map((node, index) => ({
          ...node,
          model_ref: `model-ref-${index}-abcdefghijkl`,
        })),
        visible_text: "",
      },
      customSnapshot,
    );

    expect(tools[0]?.function.parameters).toMatchObject({
      properties: { target: { enum: ["model-ref-1-abcdefghijkl"] } },
    });
  });

  it("exposes page APIs only through opaque action refs and enum options", () => {
    const tools = genericActTools(
      [],
      { ...snapshot, nodes: [], visible_text: "" },
      snapshot,
      undefined,
      [
        {
          action_ref: "action-ref-abcdefghijkl",
          adapter_id: "fixture_variant",
          adapter_version: 1,
          action_id: "select_variant",
          option_ids: ["low", "high"],
          option_labels: { low: "Low", high: "High" },
          label: "Variant 선택",
          description: "fixture",
          completion: { control_name: "Variant", option_name: "Variant" },
        },
      ],
    );
    expect(tools).toHaveLength(1);
    expect(tools[0]?.function.name).toBe("propose_page_api");
    expect(tools[0]?.function.parameters).toMatchObject({
      properties: {
        action_ref: { enum: ["action-ref-abcdefghijkl"] },
        option_id: { enum: ["low", "high"] },
      },
    });
  });
});
