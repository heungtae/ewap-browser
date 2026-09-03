import { fail, isPlainObject } from "../security/validation.js";

export type BusinessMcpBinding = {
  server_id: string;
  endpoint: string;
  tool_id: string;
  title: string;
  description: string;
  arguments: {
    type: "object";
    additionalProperties: false;
    properties: Record<string, { type: "string"; maxLength: number }>;
    required: string[];
  };
  result_key: string;
  value_kind: "text";
  max_result_chars: number;
};

const identifier = (value: unknown, maximum = 128): value is string =>
  typeof value === "string" &&
  new RegExp(`^[A-Za-z][A-Za-z0-9_.-]{0,${maximum - 1}}$`).test(value);

const text = (value: unknown, maximum: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= maximum;

const argumentSchema = (value: unknown): BusinessMcpBinding["arguments"] => {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some(
      (key) =>
        !["type", "additionalProperties", "properties", "required"].includes(
          key,
        ),
    ) ||
    value.type !== "object" ||
    value.additionalProperties !== false ||
    !isPlainObject(value.properties) ||
    !Array.isArray(value.required) ||
    Object.keys(value.properties).length > 32 ||
    value.required.length > Object.keys(value.properties).length ||
    value.required.some((key) => !identifier(key, 65)) ||
    new Set(value.required).size !== value.required.length
  )
    return fail("PROFILE_UNAVAILABLE");
  for (const [key, schema] of Object.entries(value.properties))
    if (
      !identifier(key, 65) ||
      !isPlainObject(schema) ||
      Object.keys(schema).some(
        (field) => !["type", "maxLength"].includes(field),
      ) ||
      schema.type !== "string" ||
      typeof schema.maxLength !== "number" ||
      !Number.isInteger(schema.maxLength) ||
      schema.maxLength < 1 ||
      schema.maxLength > 1_024
    )
      return fail("PROFILE_UNAVAILABLE");
  return value as BusinessMcpBinding["arguments"];
};

export const businessMcpBindings = (value: unknown): BusinessMcpBinding[] => {
  if (!Array.isArray(value) || value.length > 32)
    return fail("PROFILE_UNAVAILABLE");
  const bindings = value.map((candidate) => {
    if (
      !isPlainObject(candidate) ||
      Object.keys(candidate).some(
        (key) =>
          ![
            "server_id",
            "endpoint",
            "tool_id",
            "title",
            "description",
            "arguments",
            "result_key",
            "value_kind",
            "max_result_chars",
          ].includes(key),
      ) ||
      !identifier(candidate.server_id) ||
      !text(candidate.endpoint, 1_024) ||
      !identifier(candidate.tool_id) ||
      !text(candidate.title, 160) ||
      !text(candidate.description, 1_000) ||
      !identifier(candidate.result_key, 65) ||
      candidate.value_kind !== "text" ||
      typeof candidate.max_result_chars !== "number" ||
      !Number.isInteger(candidate.max_result_chars) ||
      candidate.max_result_chars < 1 ||
      candidate.max_result_chars > 4_000
    )
      return fail("PROFILE_UNAVAILABLE");
    return {
      server_id: candidate.server_id,
      endpoint: candidate.endpoint,
      tool_id: candidate.tool_id,
      title: candidate.title,
      description: candidate.description,
      arguments: argumentSchema(candidate.arguments),
      result_key: candidate.result_key,
      value_kind: "text" as const,
      max_result_chars: candidate.max_result_chars,
    };
  });
  if (
    new Set(bindings.map((binding) => binding.tool_id)).size !== bindings.length
  )
    return fail("PROFILE_UNAVAILABLE");
  return bindings;
};

export const businessMcpArguments = (
  binding: BusinessMcpBinding,
  value: unknown,
): Record<string, string> => {
  if (
    !isPlainObject(value) ||
    Object.keys(value).some((key) => !(key in binding.arguments.properties)) ||
    binding.arguments.required.some((key) => !(key in value))
  )
    return fail("INVALID_ARGUMENT");
  for (const [key, argument] of Object.entries(value)) {
    const schema = binding.arguments.properties[key];
    if (
      !schema ||
      typeof argument !== "string" ||
      argument.length > schema.maxLength
    )
      return fail("INVALID_ARGUMENT");
  }
  return value as Record<string, string>;
};
