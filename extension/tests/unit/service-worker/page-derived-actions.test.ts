import { describe, expect, it } from "vitest";
import {
  pageDerivedActionTools,
  pageDerivedOptionValues,
  selectActActionTools,
} from "../../../src/service-worker/page-derived-actions.js";

const snapshot = {
  schema_version: 2 as const,
  document_epoch: "abcdefghijklmnop",
  frame_id: 0,
  nodes: [
    {
      ref_id: "button-abcdefghijklmnop",
      role: "button" as const,
      name: "Save",
      state: {},
      visible: true,
      enabled: true,
    },
    {
      ref_id: "select-abcdefghijklmnop",
      role: "combobox" as const,
      name: "Priority",
      state: {},
      visible: true,
      enabled: true,
    },
    {
      ref_id: "option-low-abcdefghijkl",
      role: "option" as const,
      name: "Low",
      state: {},
      visible: true,
      enabled: true,
      parent_ref_id: "select-abcdefghijklmnop",
    },
    {
      ref_id: "option-hidden-abcdefghij",
      role: "option" as const,
      name: "Internal",
      state: {},
      visible: false,
      enabled: true,
    },
  ],
  visible_text: "",
};

describe("page-derived Act discovery", () => {
  it("uses only visible enabled controls and their observed options", () => {
    expect(pageDerivedActionTools(snapshot).map((tool) => tool.tool)).toEqual([
      "click_by_ref",
      "select_option_by_ref",
    ]);
    expect(
      pageDerivedOptionValues(snapshot, "select-abcdefghijklmnop"),
    ).toEqual(["Low"]);
  });

  it("does not expose an Act tool when the snapshot has no safe candidate", () => {
    expect(
      pageDerivedActionTools({ ...snapshot, nodes: [snapshot.nodes[3]!] }),
    ).toEqual([]);
  });

  it("does not offer values belonging to a disabled combobox", () => {
    const disabledSelect = { ...snapshot.nodes[1]!, enabled: false };
    expect(
      pageDerivedOptionValues({
        ...snapshot,
        nodes: [disabledSelect, snapshot.nodes[2]!],
      }),
    ).toEqual([]);
    expect(
      pageDerivedActionTools({
        ...snapshot,
        nodes: [disabledSelect, snapshot.nodes[2]!],
      }),
    ).toEqual([]);
  });

  it("requires a workflow to disambiguate multiple enabled comboboxes", () => {
    const secondSelect = {
      ...snapshot.nodes[1]!,
      ref_id: "second-select-abcdefghij",
      name: "Region",
    };
    const secondOption = {
      ...snapshot.nodes[2]!,
      ref_id: "second-option-abcdefghij",
      name: "EMEA",
      parent_ref_id: secondSelect.ref_id,
    };
    expect(
      pageDerivedActionTools({
        ...snapshot,
        nodes: [
          snapshot.nodes[1]!,
          snapshot.nodes[2]!,
          secondSelect,
          secondOption,
        ],
      }).map((tool) => tool.tool),
    ).toEqual([]);
  });

  it("allows only observed same-origin links to become navigation candidates", () => {
    const link = {
      ref_id: "link-abcdefghijklmnop",
      role: "link" as const,
      name: "Company overview",
      state: {},
      visible: true,
      enabled: true,
      same_origin_link: true,
    };
    expect(
      pageDerivedActionTools({ ...snapshot, nodes: [link] }).map(
        (tool) => tool.tool,
      ),
    ).toEqual(["navigate"]);
    expect(
      pageDerivedActionTools({
        ...snapshot,
        nodes: [{ ...link, same_origin_link: false }],
      }),
    ).toEqual([]);
    expect(
      pageDerivedActionTools({
        ...snapshot,
        nodes: [{ ...link, same_origin_link: false, cross_origin_link: true }],
      }).map((tool) => tool.tool),
    ).toEqual(["navigate"]);
  });

  it("includes observed radio, tab, and menuitem controls without duplicate tools", () => {
    const controls = [
      {
        ref_id: "radio-abcdefghijklmnop",
        role: "radio" as const,
        name: "Monthly",
        state: { checked: false },
        visible: true,
        enabled: true,
      },
      {
        ref_id: "tab-abcdefghijklmnop",
        role: "tab" as const,
        name: "Overview",
        state: { selected: false },
        visible: true,
        enabled: true,
      },
      {
        ref_id: "menu-abcdefghijklmnop",
        role: "menuitem" as const,
        name: "Settings",
        state: {},
        visible: true,
        enabled: true,
      },
    ];
    expect(
      pageDerivedActionTools({ ...snapshot, nodes: controls }).map((tool) => ({
        tool: tool.tool,
        roles: tool.eligible_roles,
      })),
    ).toEqual([
      { tool: "click_by_ref", roles: ["tab", "menuitem"] },
      { tool: "set_checked_by_ref", roles: ["radio"] },
    ]);
  });

  it("keeps the current page as the action source of truth before a Profile", () => {
    const profileTools = [
      {
        tool: "press_key_by_ref" as const,
        effect: "server-side" as const,
        risk: "R2" as const,
        eligible_roles: ["button" as const],
        verifier: {
          kind: "semantic-state-transition" as const,
          declaration_id: "profile-only",
          pre_state_digest: "",
          required_changes: [],
        },
      },
    ];
    const pageFirst = selectActActionTools(snapshot, profileTools);
    expect(pageFirst.discovery).toBe("page-derived");
    expect(pageFirst.definitions.map((definition) => definition.tool)).toEqual([
      "click_by_ref",
      "select_option_by_ref",
    ]);
    expect(
      selectActActionTools(
        { ...snapshot, nodes: [snapshot.nodes[3]!] },
        profileTools,
      ),
    ).toMatchObject({ discovery: "profile", definitions: profileTools });
  });
});
