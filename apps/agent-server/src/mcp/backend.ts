import {
  backendCommandSchema,
  type Grant,
} from "../../../../packages/integration-adapters/src/contracts.js";
import {
  canonicalName,
  type ToolRegistry,
} from "../../../../packages/tool-registry/src/index.js";
import type { McpTaskApi } from "./task-api.js";
import type { ExternalTools } from "./external-tools.js";
import { catalog } from "./catalog.js";
export class McpBackend {
  constructor(
    private tasks: McpTaskApi,
    private external: ExternalTools,
    private registry: ToolRegistry,
  ) {}
  async request(grant: Grant, raw: unknown): Promise<unknown> {
    const command = backendCommandSchema.parse(raw);
    if (command.kind === "catalog") return catalog(grant, this.registry);
    const { name, arguments: input } = command;
    if (!catalog(grant, this.registry).tools.some((t) => t.name === name))
      throw new Error("MCP_TOOL_DENIED");
    if (name === "agent.execute_request")
      return this.tasks.execute(grant, input, "jev");
    if (name === "agent.open_external_task")
      return this.tasks.execute(grant, input, "external");
    if (name === "agent.get_status") {
      const bound = this.tasks.bind(grant, input),
        status = this.tasks.status(grant, input);
      const steps = this.external.summary(bound.task.id);
      return {
        ...status,
        dispatchUnknown: steps.dispatchUnknown,
        pendingApprovalOrInput:
          !["completed", "failed", "cancelled"].includes(status.phase) &&
          (status.pendingApprovalOrInput || steps.pendingApprovalOrInput),
        actionVerified: status.actionVerified || steps.actionVerified,
      };
    }
    if (name === "agent.cancel") {
      const bound = this.tasks.bind(grant, input);
      const result = this.tasks.cancel(grant, input);
      this.external.cancelTask(bound.task.id);
      const summary = this.external.summary(bound.task.id);
      return {
        ...result,
        pendingApprovalOrInput: false,
        actionVerified: result.actionVerified || summary.actionVerified,
        dispatchUnknown: summary.dispatchUnknown,
      };
    }
    return this.external.call(grant, canonicalName(name), input);
  }
}
