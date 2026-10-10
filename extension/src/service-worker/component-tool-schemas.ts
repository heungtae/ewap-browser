import type { ProviderToolDefinition } from "../providers/types.js";
const binding = {
  resource_id: { type: "string" },
  resource_revision: { type: "string" },
};
export const componentToolSchemas: ProviderToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "describe_component",
      description:
        "Describe an observed component from list_page_resources: structure, visible/logical/total counts, channels, EOF and side effects. Kind is an observation, never authority. Hidden tree children and chart values stay unknown. No data execution.",
      parameters: {
        type: "object",
        properties: binding,
        required: Object.keys(binding),
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_component_data",
      description:
        "Read an explicitly selected component channel. visible_rows/subtree/description read current accessible DOM only. bounded_scroll requires collection permission and user approval, restores position and reports restoration. reviewed_data/alt_table need a registered channel; unsupported never executes code. Copy continuation.arguments for more masked rows. A partial or later window is not the entire dataset. For visual omit max_items/cursor; captures an approved viewport image. Also use supported screenshot/zoom; pixels never create action targets or exact values.",
      parameters: {
        type: "object",
        properties: {
          ...binding,
          channel: {
            type: "string",
            enum: [
              "visible_rows",
              "subtree",
              "description",
              "bounded_scroll",
              "reviewed_data",
              "alt_table",
              "continuation",
              "visual",
            ],
          },
          max_items: { type: "integer", minimum: 1, maximum: 200 },
          cursor: { type: "string" },
        },
        required: [...Object.keys(binding), "channel"],
        additionalProperties: false,
      },
    },
  },
];
