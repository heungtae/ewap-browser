import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  digest,
  canonical,
  type ControllerPort,
} from "../../../../../packages/task-engine/src/decisions/index.js";
import {
  evaluateScenario,
  scenarioBindings,
  type HoldoutCase,
} from "../../../fixture/s27-scenarios.js";
import { response } from "./support.js";
import { bindArgument } from "../../../../../packages/task-engine/src/decisions/index.js";
const corpus = JSON.parse(
  readFileSync("docs/baselines/s27/holdout.json", "utf8"),
) as { cases: HoldoutCase[] };
describe("S27-R05 frozen reference-scenario mechanics (fixture-selected answers)", () => {
  it.each(corpus.cases)(
    "$id binds selected registered fragments without a GPT controller",
    async (c) => {
      const port: ControllerPort = {
        evaluate: async (f) => response(f, c.expected[f.phase]!),
      };
      const result = await evaluateScenario(c, port);
      expect(result.passed).toBe(true);
      expect(result.gptControllerCalls).toBe(0);
      expect(result.browserDispatches).toBe(0);
      if (c.scenario === "search")
        expect(
          bindArgument(
            scenarioBindings(c).sources.get("equipment"),
            scenarioBindings(c).context,
          ),
        ).toMatchObject({ status: "BOUND", value: "EQP001" });
      if (c.scenario === "analysis")
        expect(
          bindArgument(
            scenarioBindings(c).sources.get("date_range"),
            scenarioBindings(c).context,
          ),
        ).toMatchObject({
          status: "BOUND",
          value: { timezone: "Asia/Seoul", start: "2026-10-17T15:00:00.000Z" },
        });
    },
  );
  it("keeps expectations outside native requests and does not call fixtures live evidence", () => {
    expect(corpus.cases).toHaveLength(12);
    expect(canonical(corpus)).not.toContain("api_key");
    expect(digest(corpus)).toHaveLength(64);
  });
});
