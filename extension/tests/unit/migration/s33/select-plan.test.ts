import { expect, it } from "vitest";
import { selectPlan } from "../../../../../packages/task-engine/src/orchestration/select-plan.js";
import {
  DecisionBudget,
  DecisionController,
  validateFragment,
  type DecisionFrame,
} from "../../../../../packages/task-engine/src/decisions/index.js";
import {
  candidate,
  frame,
  context,
  response,
  bindingContext,
  literal,
} from "../s27/support.js";
const scope = {
  origins: ["https://fixture.test"],
  tabRefs: ["owned-tab"],
  availableTools: new Set(["web.fill"] as const),
};
function setup(transform = (f: DecisionFrame) => f) {
  const budget = new DecisionBudget();
  const input = transform(frame(budget));
  const controller = new DecisionController(
    { evaluate: async (f) => response(f) },
    budget,
    () => input.context,
  );
  return { input, controller };
}
it("S33 selects a registered advisory fragment as a proposal with a new revision", async () => {
  const { input, controller } = setup();
  const result = await selectPlan(
    controller,
    input,
    bindingContext,
    new Map([["equipment", literal]]),
    scope,
  );
  expect(result.status).toBe("PLANNED");
  expect(result.plan?.revision).toBe(context.planRevision + 1);
  expect(result.plan?.allowedTabRefs).toEqual(["owned-tab"]);
  expect(result.plan?.allowedScopeIds).toEqual([context.scopeId]);
  expect(result.plan?.steps[0]?.tool).toBe("web.fill");
});
it("S33 refuses changed sources and absent live registry tools", async () => {
  let s = setup();
  expect(
    (await selectPlan(s.controller, s.input, bindingContext, new Map(), scope))
      .status,
  ).toBe("NEED_INPUT");
  s = setup();
  await expect(
    selectPlan(
      s.controller,
      s.input,
      bindingContext,
      new Map([["equipment", literal]]),
      { ...scope, availableTools: new Set() },
    ),
  ).rejects.toThrow("CAPABILITY_UNAVAILABLE");
});
it("S33 never promotes a mutation fragment in Ask even with a read effect label", () => {
  const c = candidate();
  c.modes = ["ask", "act"];
  c.steps[0]!.effect = "read";
  expect(() => validateFragment(c, { ...context, mode: "ask" })).toThrow(
    "CYCLIC_UNORDERED_OR_FORBIDDEN_PLAN",
  );
});
it("S33 rechecks current context after selection before returning a plan", async () => {
  const { input, controller } = setup();
  await expect(
    selectPlan(
      controller,
      input,
      () => ({
        ...bindingContext(),
        current: { ...context, capabilityRevision: 9 },
      }),
      new Map([["equipment", literal]]),
      scope,
    ),
  ).rejects.toThrow("PLAN_CONTEXT_STALE");
});
it("S33 missing controller returns unavailable without a fallback", async () => {
  const budget = new DecisionBudget();
  const controller = new DecisionController(undefined, budget, () => context);
  expect(
    (
      await selectPlan(
        controller,
        frame(budget),
        bindingContext,
        new Map(),
        scope,
      )
    ).status,
  ).toBe("CONTROLLER_UNAVAILABLE");
  expect(budget.snapshot().calls).toBe(0);
});
