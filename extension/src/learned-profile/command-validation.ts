import { isPlainObject } from "../security/validation.js";
import { taskKinds } from "./types.js";
const closed = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).every((k) => keys.includes(k));
const member = (v: unknown, choices: readonly string[]) =>
  typeof v === "string" && choices.includes(v);
export function validateCommands(commands: unknown[]) {
  for (const c of commands) {
    if (
      !isPlainObject(c) ||
      !closed(c, [
        "command_id",
        "revision",
        "namespace",
        "name",
        "recipe_id",
        "recipe_revision",
        "backend",
        "effect",
        "inputs",
      ]) ||
      typeof c.command_id !== "string" ||
      !/^[a-f0-9-]{36}$/.test(c.command_id) ||
      !Number.isInteger(c.revision) ||
      !Number.isInteger(c.recipe_revision) ||
      typeof c.recipe_id !== "string" ||
      typeof c.namespace !== "string" ||
      !/^[a-z0-9-]{1,64}$/.test(c.namespace) ||
      !member(c.name, taskKinds) ||
      !member(c.backend, ["read_recipe", "ui_recipe", "method_hint"]) ||
      !member(c.effect, ["read", "ui_change", "method_unknown"]) ||
      c.effect !==
        (c.backend === "read_recipe"
          ? "read"
          : c.backend === "ui_recipe"
            ? "ui_change"
            : "method_unknown") ||
      !Array.isArray(c.inputs) ||
      c.inputs.length > 1
    )
      throw new Error("INVALID_PAGE_COMMAND");
    for (const i of c.inputs)
      if (
        !isPlainObject(i) ||
        !closed(i, ["name", "type", "required"]) ||
        i.name !== "query" ||
        i.type !== "string" ||
        i.required !== true
      )
        throw new Error("INVALID_COMMAND_INPUT");
    if (new TextEncoder().encode(JSON.stringify(c)).length > 4096)
      throw new Error("COMMAND_TOO_LARGE");
  }
}
