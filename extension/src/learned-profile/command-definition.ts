import type { LearnedRecipe, PageCommand } from "./types.js";
export function commandFor(
  recipe: LearnedRecipe,
  namespace: string,
  previous?: PageCommand,
): PageCommand | undefined {
  if (!["none", "text"].includes(recipe.task.input)) return undefined;
  if (
    recipe.steps.some((s) => s.operation === "find") &&
    recipe.task.input !== "text"
  )
    return undefined;
  const method = recipe.steps.some((s) => s.channel === "method");
  const ui = recipe.steps.some((s) => s.channel === "ui");
  if (recipe.task.mode === "ask" && (method || ui)) return undefined;
  const backend = method ? "method_hint" : ui ? "ui_recipe" : "read_recipe";
  if (previous && previous.backend !== backend) return undefined;
  return {
    command_id: previous?.command_id ?? crypto.randomUUID(),
    revision: (previous?.revision ?? 0) + 1,
    namespace,
    name: recipe.task.kind,
    recipe_id: recipe.recipe_id,
    recipe_revision: recipe.revision,
    backend: method ? "method_hint" : ui ? "ui_recipe" : "read_recipe",
    effect: method ? "method_unknown" : ui ? "ui_change" : "read",
    inputs:
      recipe.task.input === "text"
        ? [{ name: "query", type: "string", required: true }]
        : [],
  };
}
export function commandInputSchema(command: PageCommand) {
  return {
    type: "object",
    properties: {
      ...Object.fromEntries(
        command.inputs.map((i) => [i.name, { type: i.type, maxLength: 4096 }]),
      ),
      dry_run: { type: "boolean" },
    },
    required: command.inputs.map((i) => i.name),
    additionalProperties: false,
  };
}
export function commandHelp(command: PageCommand) {
  return {
    command_id: command.command_id,
    revision: command.revision,
    recipe_id: command.recipe_id,
    recipe_revision: command.recipe_revision,
    namespace: command.namespace,
    name: command.name,
    effect: command.effect,
    backend: command.backend,
    usage: `page ${command.namespace} ${command.name}${command.inputs.map((i) => ` --${i.name} "<current request>"`).join("")} [--dry-run]`,
    input_schema: commandInputSchema(command),
    authority: "advisory",
    verification: "A proposed plan or returned value is not goal completion.",
  };
}
