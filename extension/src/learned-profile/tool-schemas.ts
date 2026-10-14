import type { ProviderToolDefinition } from "../providers/types.js";
import { taskKinds } from "./types.js";
export const metadataNames = [
  "describe_learned_task",
  "list_learned_page_profiles",
  "read_learned_page_profile",
  "list_page_commands",
  "read_page_command",
  "page_command",
];
export const learnedTools: ProviderToolDefinition[] = [
  {
    name: "describe_learned_task",
    description:
      "Describe the current user task using fixed semantic categories. This only creates a request-local candidate, never authorizes execution or saves an unsuccessful run.",
    properties: {
      kind: { type: "string", enum: [...taskKinds] },
      target: {
        type: "string",
        enum: ["page", "table", "list", "form", "link", "method"],
      },
      coverage: { type: "string", enum: ["visible", "full"] },
      input: { type: "string", enum: ["none", "text", "number", "boolean"] },
      recipe_id: { type: "string", maxLength: 36 },
    },
    required: ["kind", "target", "coverage", "input"],
  },
  {
    name: "list_learned_page_profiles",
    description:
      "Read advisory task metadata for this exact current page. Not an execution capability.",
    properties: {},
    required: [],
  },
  {
    name: "read_learned_page_profile",
    description:
      "Read a bounded advisory recipe. Select only when its semantic task matches the current request.",
    properties: { recipe_id: { type: "string", maxLength: 36 } },
    required: ["recipe_id"],
  },
  {
    name: "list_page_commands",
    description:
      "List available current-page command metadata. No page read or mutation.",
    properties: {},
    required: [],
  },
  {
    name: "read_page_command",
    description: "Read current-page command help and exact input schema.",
    properties: { command_id: { type: "string", maxLength: 36 } },
    required: ["command_id"],
  },
  {
    name: "page_command",
    description:
      "Restricted page namespace command protocol. --dry-run returns metadata only. Act commands propose a draft; use normal submit_plan, approval and fresh targets afterward. Never repeat a previously dispatched mutation.",
    properties: { line: { type: "string", maxLength: 8192 } },
    required: ["line"],
  },
].map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description,
    parameters: {
      type: "object",
      properties: t.properties,
      required: t.required,
      additionalProperties: false,
    },
  },
}));
