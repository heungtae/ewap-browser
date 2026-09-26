import { describe, expect, it } from "vitest";
import { workflowActionDefinitions } from "../../../src/service-worker/act-workflow-authority.js";
import type { ProfileActionTool } from "../../../src/profile/profile.js";

const snapshot = {
  document_epoch: "epoch-abcdefghijklmnop",
  frame_id: 0,
  visible_text: "Submit invoice",
  nodes: [
    {
      ref_id: "ref-abcdefghijklmnop",
      role: "button" as const,
      name: "Submit invoice",
      state: { disabled: false },
      visible: true,
      enabled: true,
    },
  ],
};
const step = {
  id: "submit",
  tool: "click_by_ref" as const,
  target: { role: "button" as const, name: "Submit invoice" },
};
const profile: ProfileActionTool = {
  tool: "click_by_ref",
  effect: "server-side",
  risk: "R2",
  eligible_roles: ["button"],
  verifier: {
    kind: "semantic-state-transition",
    declaration_id: "profile-submit",
    pre_state_digest: "",
    required_changes: [
      { ref_id: "$target", field: "disabled", expected: true },
    ],
  },
};

describe("workflow action authority", () => {
  it("retains signed R2 risk for a page workflow step", () => {
    expect(workflowActionDefinitions(snapshot, step, [profile])).toMatchObject({
      discovery: "profile",
      definitions: [{ risk: "R2" }],
    });
  });
  it("rejects a workflow step omitted by the signed Profile", () => {
    expect(
      workflowActionDefinitions(snapshot, step, [
        { ...profile, tool: "press_key_by_ref" },
      ]),
    ).toBeUndefined();
  });
  it("uses a signed select definition even with two visible comboboxes", () => {
    const selectionSnapshot = {
      ...snapshot,
      nodes: [
        ...snapshot.nodes,
        {
          ...snapshot.nodes[0]!,
          ref_id: "first-combobox-abcdefghijkl",
          role: "combobox" as const,
          name: "Status",
        },
        {
          ...snapshot.nodes[0]!,
          ref_id: "second-combobox-abcdefghijk",
          role: "combobox" as const,
          name: "Priority",
        },
      ],
    };
    const selectionStep = {
      ...step,
      tool: "select_option_by_ref" as const,
      target: { role: "combobox" as const, name: "Status" },
    };
    expect(
      workflowActionDefinitions(selectionSnapshot, selectionStep, [
        {
          ...profile,
          tool: "select_option_by_ref",
          eligible_roles: ["combobox"],
          option_values: ["Open", "Closed"],
        },
      ]),
    ).toMatchObject({
      discovery: "profile",
      targetRefId: "first-combobox-abcdefghijkl",
      definitions: [{ option_values: ["Open", "Closed"] }],
    });
  });
});
