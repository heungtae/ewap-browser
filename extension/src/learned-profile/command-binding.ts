import type { LearnedRecipe, PageCommand } from "./types.js";
export function commandMatchesRecipe(
  command: PageCommand,
  recipe: LearnedRecipe,
): boolean {
  const backend = recipe.steps.some((s) => s.channel === "method")
    ? "method_hint"
    : recipe.steps.some((s) => s.channel === "ui")
      ? "ui_recipe"
      : "read_recipe";
  const effect =
    backend === "method_hint"
      ? "method_unknown"
      : backend === "ui_recipe"
        ? "ui_change"
        : "read";
  return (
    command.recipe_id === recipe.recipe_id &&
    command.recipe_revision === recipe.revision &&
    command.name === recipe.task.kind &&
    command.backend === backend &&
    command.effect === effect &&
    command.inputs.length === (recipe.task.input === "text" ? 1 : 0) &&
    ["none", "text"].includes(recipe.task.input)
  );
}
