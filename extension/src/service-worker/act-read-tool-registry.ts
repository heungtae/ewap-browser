import { isPlainObject } from "../security/validation.js";
import type { ProviderToolDefinition } from "../providers/types.js";

export type ActReadRegistration = {
  schema: ProviderToolDefinition;
  version: 1;
  resultSchema: Record<string, unknown>;
  mode: "act";
  phase: "read";
  consent: "none" | "source-disclosure";
  binding: "request-document";
  budget: "read";
  execute?: (args: string) => Promise<unknown>;
};

// Schema, capability and dispatch share the exact executor-backed entries.
export const createActReadToolRegistry = (entries: ActReadRegistration[]) => {
  const names = new Set<string>();
  for (const entry of entries) {
    if (names.has(entry.schema.function.name))
      throw new Error("DUPLICATE_TOOL_REGISTRATION");
    names.add(entry.schema.function.name);
  }
  const callable = entries.filter((entry) => entry.execute !== undefined);
  return {
    tools: callable.map((entry) => entry.schema),
    capabilities: callable.map((entry) => entry.schema.function.name),
    unsupported: entries
      .filter((entry) => !entry.execute)
      .map((entry) => ({
        name: entry.schema.function.name,
        reason: "EXECUTOR_UNAVAILABLE",
      })),
    async execute(call: { name: string; args: string }): Promise<unknown> {
      const entry = callable.find(
        (candidate) => candidate.schema.function.name === call.name,
      );
      if (!entry?.execute)
        return { status: "UNSUPPORTED", code: "EXECUTOR_UNAVAILABLE" };
      const result = await entry.execute(call.args);
      if (!isPlainObject(result))
        return { status: "FAILED", code: "INVALID_TOOL_RESULT" };
      const properties = entry.resultSchema.properties as
        | { status?: { enum?: string[] } }
        | undefined;
      if (
        properties?.status?.enum &&
        (typeof result.status !== "string" ||
          !properties.status.enum.includes(result.status))
      )
        return { status: "FAILED", code: "INVALID_TOOL_RESULT" };
      return result;
    },
  };
};
