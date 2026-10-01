import { expect, it } from "vitest";
import { parsePageApiProposal } from "../../../src/service-worker/act-proposal-parser.js";
import { PageApiRegistry } from "../../../src/page-api/registry.js";
import { fixturePageApiAdapter } from "../../../src/page-api/adapters/fixture.js";
import { createPageApiObserver } from "../../../src/service-worker/page-api-observer.js";
import type { PageApiIntent } from "../../../src/contracts/page-api-types.js";
import type { SemanticSnapshot } from "../../../src/contracts/semantic-types.js";

const action = {
  ...fixturePageApiAdapter.actions[0]!,
  adapter_id: "fixture_variant",
  adapter_version: 1,
  action_ref: "opaque-abcdefghijklmnop",
};
const args = {
  action_ref: action.action_ref,
  option_id: "high",
  approval_scope: "single_step",
  approval_reason: "선택",
};
it.each([
  { function_path: "demoControls.selectVariant" },
  { code: "eval(secret)" },
  { option_id: "outside" },
  { action_ref: "forged" },
  { approval_scope: "session" },
  { unknown: "secret" },
])("API-04/07 rejects unknown authority or argument %j", (change) => {
  expect(() =>
    parsePageApiProposal(
      {
        id: "tool-abcdefghijklmnop",
        name: "propose_page_api",
        arguments: JSON.stringify({ ...args, ...change }),
      },
      [action],
      "https://page-api-fixture.invalid",
    ),
  ).toThrow();
});
it("API-12 rejects server-side or R2 adapter registration", () => {
  for (const change of [{ effect: "server-side" }, { risk: "R2" }])
    expect(
      () =>
        new PageApiRegistry([
          {
            ...fixturePageApiAdapter,
            actions: [
              { ...fixturePageApiAdapter.actions[0]!, ...change } as never,
            ],
          },
        ]),
    ).toThrow();
});
it.each(["other-control", "truncated", "wrong-option", "hidden-control"])(
  "independent UI observation cannot accept %s",
  async (kind) => {
    const snapshot: SemanticSnapshot = {
      document_epoch: "epoch",
      frame_id: 0,
      visible_text: "",
      truncated: kind === "truncated",
      nodes: [
        {
          ref_id: "control",
          role: "combobox",
          name: "Variant",
          state: {},
          visible: kind !== "hidden-control",
          enabled: true,
        },
        {
          ref_id: "option",
          parent_ref_id: kind === "other-control" ? "other" : "control",
          role: "option",
          name: kind === "wrong-option" ? "Medium" : "High",
          state: { selected: true },
          visible: true,
          enabled: true,
        },
      ],
    };
    const observe = createPageApiObserver(async () => snapshot);
    const result = await observe(
      { tab_id: 1, document_epoch: "epoch" } as PageApiIntent,
      "High",
      { control_name: "Variant", option_name: "Variant" },
      1000,
    );
    expect(result).not.toBe("satisfied");
  },
);
