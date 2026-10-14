import { isPlainObject } from "../security/validation.js";
import { commandHelp } from "./command-definition.js";
import type { validateInvocation } from "./command-parser.js";
import type { LearnedRecipe, LearnedTask } from "./types.js";
export function createCommandExecutor({
  recipes,
  gate,
  current,
  select,
  observe,
}: {
  recipes: LearnedRecipe[];
  gate(): Promise<boolean>;
  current(): boolean;
  select(recipeId: string, task: LearnedTask): void;
  observe(name: string, result: unknown): void;
}) {
  return async (
    invocation: ReturnType<typeof validateInvocation>,
    execute: (call: { name: string; arguments: string }) => Promise<unknown>,
  ) => {
    const { command, args } = invocation;
    const recipe = recipes.find((r) => r.recipe_id === command.recipe_id)!;
    if (args.dry_run)
      return {
        status: "PROPOSED",
        dry_run: true,
        help: commandHelp(command),
        task: recipe.task,
        steps: recipe.steps,
        dispatch: "not_dispatched",
        verification: "not_performed",
      };
    if (!(await gate())) return { status: "STALE", dispatch: "not_dispatched" };
    select(recipe.recipe_id, recipe.task);
    if (command.backend !== "read_recipe")
      return {
        status: "PROPOSED",
        command_usage_id: crypto.randomUUID(),
        task: recipe.task,
        steps: recipe.steps,
        ...(args.query === undefined
          ? {}
          : { current_request_inputs: { query: args.query } }),
        requires: "fresh_discovery_submit_plan_and_approval",
        dispatch: "not_dispatched",
        verification: "not_performed",
      };
    // Current snapshot reads lower to the existing Ask reader. Other channels require fresh discovery.
    if (
      recipe.steps.some(
        (s) =>
          ![
            "read_semantic_projection",
            "read_page",
            "get_page_text",
            "find",
          ].includes(s.operation),
      )
    )
      return {
        status: "NEEDS_CONTEXT",
        task: recipe.task,
        requires: "fresh_discovery_and_current_coverage",
        steps: recipe.steps,
        dispatch: "not_dispatched",
      };
    const results: unknown[] = [];
    for (const step of recipe.steps) {
      if (!current())
        return { status: "CANCELLED", dispatch: "not_dispatched" };
      const argumentsValue =
        step.operation === "find"
          ? { query: args.query, scope: "visible_only" }
          : {};
      if (step.operation === "find" && !args.query)
        return { status: "NEEDS_CONTEXT" };
      const result = await execute({
        name: step.operation,
        arguments: JSON.stringify(argumentsValue),
      });
      observe(step.operation, result);
      results.push(result);
      if (
        isPlainObject(result) &&
        (result.ok === false || typeof result.code === "string")
      )
        return { status: "FAILED", results, dispatch: "not_dispatched" };
    }
    return {
      status: "AVAILABLE",
      results,
      dispatch: "not_dispatched",
      verification: "read_only_no_goal_claim",
    };
  };
}
