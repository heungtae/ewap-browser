import type { LearnedRecipe, PageCommand } from "./types.js";
import type { ProviderToolDefinition } from "../providers/types.js";
import { parsePageCommand, validateInvocation } from "./command-parser.js";
export function commandReadCost(
  call: { name: string; arguments: string },
  generated: ProviderToolDefinition[],
  commands: PageCommand[],
  recipes: LearnedRecipe[],
): number {
  try {
    const a: unknown = JSON.parse(call.arguments);
    const index = generated.findIndex((t) => t.function.name === call.name);
    const value =
      index >= 0
        ? validateInvocation(commands[index]!, a)
        : call.name === "page_command"
          ? parsePageCommand((a as { line?: unknown }).line, commands)
          : undefined;
    if (
      !value ||
      "help" in value ||
      value.args.dry_run ||
      value.command.backend !== "read_recipe"
    )
      return 1;
    return Math.max(
      1,
      recipes.find((r) => r.recipe_id === value.command.recipe_id)?.steps
        .length ?? 1,
    );
  } catch {
    return 1;
  }
}
