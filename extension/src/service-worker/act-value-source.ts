import { opaqueId } from "../security/canonical.js";
import { fail, isPlainObject } from "../security/validation.js";
import type {
  ProviderToolCall,
  ProviderToolDefinition,
} from "../providers/types.js";

// Ephemeral, turn-local source: only the user's original request, never page data.
export const actValueSource = (source: string, revision: number) => {
  const id = opaqueId();
  const indexed = (start: number, end: number) =>
    Array.from({ length: end - start }, (_, n) => [
      start + n,
      source[start + n],
    ]);
  return {
    context: JSON.stringify({
      user_value_source: {
        source_id: id,
        request_revision: revision,
        length: source.length,
        offset_unit: "UTF-16 code units; end is exclusive",
        boundary_characters: [
          ...indexed(0, Math.min(256, source.length)),
          ...(source.length > 256
            ? indexed(Math.max(256, source.length - 64), source.length)
            : []),
        ],
        instruction:
          "For a long exact input value, choose value_span from this original user request instead of copying the value. Select the exact start/end boundaries using indexed characters and source length. Do not include request instructions. If uncertain, ask the user. No action occurs until full resolved value approval.",
      },
    }),
    tools: (tools: ProviderToolDefinition[]) =>
      tools.map((tool) => {
        if (tool.function.name !== "propose_set_text") return tool;
        return {
          ...tool,
          function: {
            ...tool.function,
            description:
              tool.function.description +
              " For long values prefer value_span: select exact boundaries in the supplied user source instead of regenerating repeated characters. Supply either value or value_span, never both.",
            parameters: {
              ...tool.function.parameters,
              properties: {
                ...(tool.function.parameters.properties as Record<
                  string,
                  unknown
                >),
                value_span: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    source_id: { type: "string", enum: [id] },
                    start: { type: "integer", minimum: 0 },
                    end: { type: "integer", maximum: source.length },
                  },
                  required: ["source_id", "start", "end"],
                },
              },
            },
          },
        };
      }),
    resolve: (call: ProviderToolCall): ProviderToolCall => {
      if (call.name !== "propose_set_text") return call;
      const args: unknown = JSON.parse(call.arguments);
      if (!isPlainObject(args) || args.value_span === undefined) return call;
      const span = args.value_span;
      if (
        !isPlainObject(span) ||
        Object.keys(span).some(
          (key) => !["source_id", "start", "end"].includes(key),
        ) ||
        span.source_id !== id ||
        args.value !== undefined ||
        args.value_source_revision !== revision ||
        !Number.isInteger(span.start) ||
        !Number.isInteger(span.end)
      )
        return fail("VALUE_BINDING_INVALID");
      const start = span.start as number,
        end = span.end as number;
      const splitsSurrogate = (offset: number) =>
        offset > 0 &&
        offset < source.length &&
        /[\uD800-\uDBFF]/.test(source[offset - 1] ?? "") &&
        /[\uDC00-\uDFFF]/.test(source[offset] ?? "");
      if (
        start < 0 ||
        end > source.length ||
        start >= end ||
        end - start > 8192 ||
        splitsSurrogate(start) ||
        splitsSurrogate(end)
      )
        return fail("VALUE_BINDING_INVALID");
      const value = source.slice(start, end);
      if ([...value].length > 4096) return fail("VALUE_BINDING_INVALID");
      const { value_span: _span, ...rest } = args;
      return { ...call, arguments: JSON.stringify({ ...rest, value }) };
    },
  };
};
