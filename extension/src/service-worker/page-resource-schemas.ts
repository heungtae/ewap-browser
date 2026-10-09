import type { ProviderToolDefinition } from "../providers/types.js";
const integer = (minimum: number, maximum: number) => ({
  type: "integer",
  minimum,
  maximum,
  description:
    "Optional JSON integer (for example 8), never a quoted number. Omit this field when using the default.",
});
const cursor = {
  type: "string",
  description:
    "Omit on the first call. Otherwise copy the exact cursor from this SAME tool's continuation.arguments. Search cursors also require the SAME query. Never send the strings None or null, invent a cursor, or use a list cursor for search.",
};
export const pageResourceToolSchemas: ProviderToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "list_page_resources",
      description:
        "List current static page description and inline/external scripts with opaque IDs and revision. First call: {}. No source body. To continue, copy continuation.arguments exactly. progress counts all distinct pages inspected; partial inventory is not a complete review.",
      parameters: {
        type: "object",
        properties: {
          cursor,
          page_size: integer(1, 50),
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_page_resources",
      description:
        'Search static source for a literal query. First call: {"query":"your literal term"}, without cursor. page_size is an integer at most 8, default 8. Await source consent. Empty hits with next_cursor means ONLY THIS PAGE had no match: copy continuation.arguments to continue the same query. Inspect progress for cumulative coverage. Read a relevant hit with read_page_resource before explaining its code. Never executes code.',
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", minLength: 1, maxLength: 512 },
          cursor,
          page_size: integer(1, 8),
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_page_resource",
      description:
        "Read a bounded masked static source chunk by opaque resource_id. Use a search hit's resource_id, resource_revision and byte_offset as offset. Omit optional fields unless needed; JSON null means omitted. Await source consent. For more chunks copy continuation.arguments exactly. Reading confers no execution or endpoint authority.",
      parameters: {
        type: "object",
        properties: {
          resource_id: { type: "string" },
          resource_revision: { type: "string" },
          cursor,
          max_bytes: integer(1, 16384),
          offset: integer(0, 1024 * 1024),
        },
        required: ["resource_id"],
        additionalProperties: false,
      },
    },
  },
];
