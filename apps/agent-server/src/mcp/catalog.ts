import { z } from "zod";
import {
  inputSchemas,
  mutationTool,
  wireName,
  type ToolRegistry,
  type ToolId,
} from "../../../../packages/tool-registry/src/index.js";
import {
  executeSchema,
  statusSchema,
  type Grant,
} from "../../../../packages/integration-adapters/src/contracts.js";
const json = (schema: z.ZodType) => z.toJSONSchema(schema);
export function catalog(grant: Grant, registry: ToolRegistry) {
  const tools: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }[] = [
    {
      name: "agent.execute_request",
      description:
        "Submit a durable JEV-controlled request. Admission is unavailable until the controller/runtime gates are qualified. Never implies approval.",
      inputSchema: json(executeSchema),
    },
    {
      name: "agent.get_status",
      description:
        "Read your durable task phase, action verification and goal status, including pending approval/input.",
      inputSchema: json(statusSchema),
    },
    {
      name: "agent.cancel",
      description:
        "Cancel your durable task. Disconnect alone does not cancel or approve work.",
      inputSchema: json(statusSchema),
    },
  ];
  if (grant.externalController) {
    tools.push({
      name: "agent.open_external_task",
      description:
        "Explicitly create an external-controller task under the same runtime/policy. Does not grant approval or bypass goal validation.",
      inputSchema: json(executeSchema),
    });
    for (const item of registry
      .inventory()
      .filter(
        (i) =>
          i.implemented &&
          grant.tools.includes(i.tool) &&
          (grant.modes.includes("act") || !mutationTool(i.tool)),
      )) {
      tools.push({
        name: wireName(item.tool),
        description: `Propose ${item.tool} through the shared runtime. Use a stable callId for polling pending approval; do not supply approval/evidence tokens.`,
        inputSchema: {
          type: "object",
          additionalProperties: false,
          required: ["taskHandle", "callId", "input"],
          properties: {
            taskHandle: { type: "string", format: "uuid" },
            callId: { type: "string", pattern: "^[A-Za-z0-9_.:-]{1,128}$" },
            input: z.toJSONSchema(inputSchemas[item.tool as ToolId]),
          },
        },
      });
    }
  }
  return { tools };
}
