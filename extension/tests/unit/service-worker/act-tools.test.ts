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
      },
    });
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
});
