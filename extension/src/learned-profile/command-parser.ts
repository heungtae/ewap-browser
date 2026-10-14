import type { PageCommand } from "./types.js";
import { isPlainObject } from "../security/validation.js";
export type CommandInvocation = {
  command: PageCommand;
  args: { query?: string; dry_run: boolean };
};
export function validateInvocation(
  command: PageCommand,
  args: unknown,
): CommandInvocation {
  if (
    !isPlainObject(args) ||
    Object.keys(args).some(
      (k) => !["dry_run", ...command.inputs.map((i) => i.name)].includes(k),
    ) ||
    (args.dry_run !== undefined && typeof args.dry_run !== "boolean")
  )
    throw new Error("INVALID_COMMAND_ARGUMENT");
  if (
    command.inputs.length &&
    (typeof args.query !== "string" ||
      args.query.length > 4096 ||
      args.query.length === 0)
  )
    throw new Error("INVALID_COMMAND_INPUT");
  return {
    command,
    args: {
      ...(typeof args.query === "string" ? { query: args.query } : {}),
      dry_run: args.dry_run === true,
    },
  };
}
// This lexer parses an explicit command protocol. It never parses a natural-language request.
export function parsePageCommand(
  line: unknown,
  commands: PageCommand[],
): CommandInvocation | { help: PageCommand[] } {
  if (typeof line !== "string" || line.length > 8192 || /[\r\n\0]/.test(line))
    throw new Error("INVALID_COMMAND_LINE");
  const tokens: string[] = [];
  let token = "",
    quote = "",
    started = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === quote) quote = "";
      else if (
        ch === "\\" &&
        quote === '"' &&
        [quote, "\\"].includes(line[i + 1] ?? "")
      )
        token += line[++i];
      else token += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started) {
        tokens.push(token);
        token = "";
        started = false;
      }
    } else {
      if ("|;&<>`$()".includes(ch)) throw new Error("INVALID_COMMAND_SYNTAX");
      token += ch;
      started = true;
    }
  }
  if (quote) throw new Error("INVALID_COMMAND_QUOTE");
  if (started) tokens.push(token);
  if (tokens[0] !== "page" || !tokens[1] || !tokens[2])
    throw new Error("INVALID_COMMAND_LINE");
  const current = commands.filter((c) => c.namespace === tokens[1]);
  if (tokens[2] === "help" && tokens.length === 3) return { help: current };
  const matches = current.filter((c) => c.name === tokens[2]);
  if (matches.length !== 1) throw new Error("COMMAND_NOT_AVAILABLE");
  const args: Record<string, unknown> = {};
  for (let i = 3; i < tokens.length; i++) {
    const flag = tokens[i]!;
    if (
      !flag.startsWith("--") ||
      Object.hasOwn(args, flag.slice(2).replace("-", "_"))
    )
      throw new Error("INVALID_COMMAND_FLAG");
    const key = flag === "--dry-run" ? "dry_run" : flag.slice(2);
    if (Object.hasOwn(args, key)) throw new Error("DUPLICATE_COMMAND_FLAG");
    if (key === "dry_run") args[key] = true;
    else if (
      key === "query" &&
      tokens[i + 1] !== undefined &&
      !tokens[i + 1]!.startsWith("--")
    )
      args[key] = tokens[++i];
    else throw new Error("INVALID_COMMAND_FLAG");
  }
  return validateInvocation(matches[0]!, args);
}
