import { describe, expect, it } from "vitest";
import { ServiceCoordinator } from "../../../src/service-worker/coordinator.js";

describe("service coordinator model projection", () => {
  it("makes hidden nodes readable but never resolvable as mutation targets", () => {
    const coordinator = new ServiceCoordinator({
      permission_origins: ["<all_urls>"],
      page_read_origins: ["<all_urls>"],
      profile_resolver_origins: [],
      llm_egress_origins: [],
    });
    coordinator.completeStorageBootstrap(true);
    const run = coordinator.runs.start(1, 0, "epoch-abcdefghijklmnop", "act");
    const model = coordinator.modelSnapshot(run.id, {
      schema_version: 2,
      document_epoch: "epoch-abcdefghijklmnop",
      frame_id: 0,
      scope: "all_dom",
      nodes: [
        {
          ref_id: "visible-abcdefghijklmnop",
          role: "button",
          name: "Save",
          state: {},
          visible: true,
          enabled: true,
          visibility: "visible",
        },
        {
          ref_id: "hidden-abcdefghijklmnop",
          role: "dialog",
          name: "Advanced",
          state: {},
          visible: false,
          enabled: true,
          visibility: "hidden",
          hidden_reason: "display_none",
        },
      ],
      visible_text: "",
    });
    const hidden = model.snapshot.nodes.find((node) => !node.visible);
    expect(hidden).toBeTruthy();
    expect(() =>
      model.resolve({ target: hidden?.model_ref ?? "", tool: "click_by_ref" }),
    ).toThrow("INVALID_ARGUMENT");
  });
});
