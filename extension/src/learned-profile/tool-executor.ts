import { taskKey } from "./task-key.js";
import { isPlainObject } from "../security/validation.js";
import { validateTask } from "./validation.js";
import { commandHelp } from "./command-definition.js";
import { parsePageCommand, validateInvocation } from "./command-parser.js";
import type { ProviderToolDefinition } from "../providers/types.js";
import type { LearnedRecipe, LearnedTask, PageCommand } from "./types.js";
export function createLearnedToolExecutor({
  gate,
  generated,
  commands,
  recipes,
  mode,
  select,
  invoke,
  failure,
}: {
  gate(): Promise<boolean>;
  generated: ProviderToolDefinition[];
  commands: PageCommand[];
  recipes: LearnedRecipe[];
  mode: "ask" | "act";
  select(task: LearnedTask, consumed?: string): void;
  invoke(
    value: ReturnType<typeof validateInvocation>,
    execute: (call: { name: string; arguments: string }) => Promise<unknown>,
  ): Promise<unknown>;
  failure(): void;
}) {
  return async (
    call: { name: string; arguments: string },
    execute: (call: { name: string; arguments: string }) => Promise<unknown>,
  ): Promise<unknown> => {
    try {
      if (!(await gate())) return { status: "STALE" };
      const a: unknown = JSON.parse(call.arguments);
      if (!isPlainObject(a)) throw new Error();
      const index = generated.findIndex((t) => t.function.name === call.name);
      if (index >= 0)
        return await invoke(validateInvocation(commands[index]!, a), execute);
      const keys =
        call.name === "describe_learned_task"
          ? ["kind", "target", "coverage", "input", "recipe_id"]
          : call.name === "page_command"
            ? ["line"]
            : call.name === "read_page_command"
              ? ["command_id"]
              : call.name === "read_learned_page_profile"
                ? ["recipe_id"]
                : [];
      if (Object.keys(a).some((k) => !keys.includes(k))) throw new Error();
      if (call.name === "describe_learned_task") {
        const task = validateTask({
          kind: a.kind,
          target: a.target,
          coverage: a.coverage,
          input: a.input,
          mode: mode,
        });
        if (a.recipe_id !== undefined) {
          const r = recipes.find(
            (r) =>
              r.recipe_id === a.recipe_id && taskKey(r.task) === taskKey(task),
          );
          if (!r) throw new Error();
          select(task, r.recipe_id);
        }
        if (a.recipe_id === undefined) select(task);
        return { status: "AVAILABLE", saved: false };
      }
      if (call.name === "list_learned_page_profiles")
        return {
          status: "AVAILABLE",
          recipes: recipes.map((r) => ({
            recipe_id: r.recipe_id,
            task: r.task,
          })),
        };
      if (call.name === "read_learned_page_profile") {
        const r = recipes.find((r) => r.recipe_id === a.recipe_id);
        return r
          ? {
              status: "AVAILABLE",
              task: r.task,
              steps: r.steps,
              authority: "advisory",
            }
          : { status: "STALE" };
      }
      if (call.name === "list_page_commands")
        return { status: "AVAILABLE", commands: commands.map(commandHelp) };
      if (call.name === "read_page_command") {
        const c = commands.find((c) => c.command_id === a.command_id);
        return c
          ? { status: "AVAILABLE", command: commandHelp(c) }
          : { status: "STALE" };
      }
      if (call.name === "page_command") {
        const parsed = parsePageCommand(a.line, commands);
        return "help" in parsed
          ? { status: "AVAILABLE", commands: parsed.help.map(commandHelp) }
          : invoke(parsed, execute);
      }
      throw new Error();
    } catch {
      failure();
      return {
        status: "FAILED",
        code: "INVALID_PAGE_COMMAND",
        dispatch: "not_dispatched",
      };
    }
  };
}
