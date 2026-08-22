import { describe, expect, it } from "vitest";
import type { ModelSemanticSnapshot } from "../../../src/contracts/types.js";
import { demoActTools } from "../../../src/service-worker/act-tools.js";

describe("demo Act tools", () => {
  it("exposes only enabled opaque model references as tool targets", () => {
    const tools = demoActTools({
      document_epoch: "epoch-abcdefghijklmnop",
      frame_id: 0,
      nodes: [
        {
          model_ref: "model-ref-product-abcdef",
          role: "combobox",
          name: "제품군",
          state: {},
          visible: true,
          enabled: true,
        },
        {
          model_ref: "model-ref-node-abcdefgh",
          role: "combobox",
          name: "공정 노드",
          state: {},
          visible: true,
          enabled: false,
        },
        {
          model_ref: "model-ref-submit-abcdef",
          role: "button",
          name: "수율 추세 분석 실행",
          state: {},
          visible: true,
          enabled: false,
        },
      ],
      visible_text: "",
    } satisfies ModelSemanticSnapshot);
    const select = tools.find(
      (tool) => tool.function.name === "propose_select_option",
    );

    expect(select?.function.parameters).toMatchObject({
      properties: {
        target: { enum: ["model-ref-product-abcdef"] },
      },
    });
    expect(select?.function.parameters).not.toMatchObject({
      properties: { target: { enum: ["제품군"] } },
    });
    expect(tools.find((tool) => tool.function.name === "propose_click")).toBe(
      undefined,
    );
  });
});
