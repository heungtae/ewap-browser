import type { PageApiAdapter } from "../../contracts/page-api-types.js";

/* A deterministic, non-production adapter.  It is intentionally not a real site. */
export const fixturePageApiAdapter: PageApiAdapter = {
  adapter_id: "fixture_variant",
  version: 1,
  origins: ["https://page-api-fixture.invalid"],
  matchesPath: (path) => path === "/variant",
  actions: [
    {
      action_id: "select_variant",
      label: "Variant 선택",
      description: "현재 페이지의 Variant 선택을 변경합니다.",
      effect: "local-ui-only",
      risk: "R1",
      option_ids: ["low", "medium", "high"],
      option_labels: { low: "Low", medium: "Medium", high: "High" },
      completion: { control_name: "Variant", option_name: "Variant" },
    },
  ],
};
