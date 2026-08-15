import { fail, isPlainObject } from "../security/validation.js";
export type AuthoritativeRequest = {
  kind: "GET_AUTHORITATIVE_FIELD";
  request_id: string;
  run_id: string;
  resolver_request_nonce: string;
  page_context_digest: string;
  profile_jws: string;
  field_id: string;
};
export type AgenticRequest = {
  kind: "CALL_PAGE_BUSINESS_TOOL";
  request_id: string;
  run_id: string;
  resolver_request_nonce: string;
  page_context_digest: string;
  profile_jws: string;
  tool_id: string;
  arguments: Record<string, string>;
};
export const validateMcpResult = (
  value: unknown,
  expected: {
    kind: string;
    requestId: string;
    id: string;
    resultKey?: string;
    valueKind?: string;
  },
): void => {
  if (!isPlainObject(value)) return fail("BUSINESS_MCP_PROTOCOL_ERROR");
  const result = value;
  if (
    result.request_id !== expected.requestId ||
    result.kind !== expected.kind ||
    typeof result.status !== "string"
  )
    return fail("BUSINESS_MCP_PROTOCOL_ERROR");
  if (result.status !== "OK") return;
  if (expected.kind === "GET_AUTHORITATIVE_FIELD_RESULT") {
    if (
      Object.keys(result).some(
        (key) =>
          ![
            "request_id",
            "kind",
            "status",
            "field_id",
            "value_kind",
            "display_value",
          ].includes(key),
      ) ||
      result.field_id !== expected.id ||
      result.value_kind !== expected.valueKind ||
      typeof result.display_value !== "string"
    )
      return fail("BUSINESS_MCP_PROTOCOL_ERROR");
    return;
  }
  if (
    Object.keys(result).some(
      (key) =>
        ![
          "request_id",
          "kind",
          "status",
          "tool_id",
          "result_key",
          "value_kind",
          "result",
        ].includes(key),
    ) ||
    result.tool_id !== expected.id ||
    result.result_key !== expected.resultKey ||
    result.value_kind !== expected.valueKind ||
    !isPlainObject(result.result) ||
    Object.keys(result.result).length !== 1 ||
    !expected.resultKey ||
    !(expected.resultKey in result.result) ||
    typeof result.result[expected.resultKey] === "object"
  )
    return fail("BUSINESS_MCP_PROTOCOL_ERROR");
};
