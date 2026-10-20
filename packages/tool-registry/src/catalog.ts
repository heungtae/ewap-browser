import { z } from "zod";
import { digest } from "@contextpilot/codebase-schema";
import { inputSchemas, toolIds, type ToolId } from "./inputs.js";
import type { ToolContext } from "./identity.js";
import type { ToolHandler } from "./ports.js";
const mutations = new Set<ToolId>([
  "web.navigate",
  "web.switch_tab",
  "web.click",
  "web.fill",
  "web.select",
  "web.invoke_action",
]);
const owners: Partial<Record<ToolId, string>> = {
  "analysis.run": "S34",
  "task.complete": "S33",
  "web.get_chart_data": "S32",
  "web.get_table_data": "S32",
  "web.get_observed_api": "S32",
};
export const wireName = (tool: ToolId): string => tool.replace(".", "__");
export const canonicalName = (wire: string): ToolId => {
  const tool = toolIds.find((t) => wireName(t) === wire);
  if (!tool) throw new Error("UNKNOWN_TOOL");
  return tool;
};
export class ToolRegistry {
  private handlers = new Map<ToolId, ToolHandler>();
  private revision = 0;
  register(tool: ToolId, handler: ToolHandler): void {
    if (!toolIds.includes(tool) || this.handlers.has(tool))
      throw new Error("TOOL_COLLISION");
    if (
      typeof handler.execute !== "function" ||
      typeof handler.verify !== "function"
    )
      throw new Error("EXECUTOR_VERIFIER_REQUIRED");
    if (owners[tool] && owners[tool] !== "S32")
      throw new Error("OWNING_SPRINT_UNQUALIFIED");
    this.handlers.set(tool, handler);
    this.revision++;
  }
  epoch(): number {
    return this.revision;
  }
  get(tool: ToolId) {
    return this.handlers.get(tool);
  }
  inventory() {
    return toolIds.map((tool) => ({
      tool,
      version: 1,
      wireName: wireName(tool),
      mutation: mutations.has(tool),
      owner: owners[tool] ?? "S30",
      implemented: this.handlers.has(tool),
      requires: ["executor", "verifier", "current_capability"],
      deadlineMs: 10000,
      outputBytes: 262144,
    }));
  }
  async snapshot(context: ToolContext, capabilities: ReadonlySet<ToolId>) {
    const tools = this.inventory()
      .filter(
        (t) =>
          t.implemented &&
          capabilities.has(t.tool) &&
          !(context.mode === "ask" && t.mutation),
      )
      .map((t) => ({
        tool: t.tool,
        wireName: t.wireName,
        inputSchema: z.toJSONSchema(inputSchemas[t.tool]),
      }));
    if (new Set(toolIds.map(wireName)).size !== toolIds.length)
      throw new Error("WIRE_COLLISION");
    return {
      revision: this.revision,
      tools,
      digest: await digest([
        this.revision,
        context.mode,
        context.capabilityRevision,
        tools,
      ]),
    };
  }
}
export function mutationTool(tool: ToolId): boolean {
  return mutations.has(tool);
}
