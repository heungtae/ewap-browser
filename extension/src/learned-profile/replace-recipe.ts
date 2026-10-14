import { commandFor } from "./command-definition.js";
import type {
  LearnedPageProfile,
  LearnedRecipe,
  LearnedTask,
  LearnedStep,
} from "./types.js";
export function replaceRecipe(
  p: LearnedPageProfile,
  existing: LearnedRecipe | undefined,
  task: LearnedTask,
  steps: LearnedStep[],
  at: number,
  repaired: boolean,
) {
  const recipe: LearnedRecipe = {
    recipe_id: existing?.recipe_id ?? crypto.randomUUID(),
    revision: (existing?.revision ?? 0) + 1,
    task,
    steps,
    enabled: true,
    auto_update: existing?.auto_update ?? true,
    lifecycle: "active",
    successful_at: at,
    name: existing?.name ?? "",
    history: [
      ...(existing?.history ?? []),
      {
        revision: (existing?.revision ?? 0) + 1,
        at,
        kind: repaired ? ("repair" as const) : ("success" as const),
        steps,
      },
    ].filter((h, index, all) =>
      h.kind === "failure"
        ? all.slice(index).filter((x) => x.kind === "failure").length <= 20
        : all.slice(index).filter((x) => x.kind !== "failure").length <= 3,
    ),
  };
  p.recipes = [
    ...p.recipes.filter((r) => r.recipe_id !== recipe.recipe_id),
    recipe,
  ];
  const previous = p.commands.find((r) => r.recipe_id === recipe.recipe_id);
  const command = commandFor(
    recipe,
    `p-${p.page_match.page_key.slice(0, 12)}`,
    previous,
  );
  p.commands = [
    ...p.commands.filter((r) => r.recipe_id !== recipe.recipe_id),
    ...(command ? [command] : []),
  ];
}
