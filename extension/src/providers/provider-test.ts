import { ContractError, fail, isPlainObject } from "../security/validation.js";
import { parseProviderBody } from "./provider-body.js";
import { parseChatResponse } from "./provider-response.js";
import type {
  NormalizedProviderRequest,
  ProviderAdapter,
  ProviderConfig,
} from "./types.js";

type Dependencies = {
  resolveConfig(id: string): Promise<ProviderConfig>;
  resolveAdapter(config: ProviderConfig): ProviderAdapter;
  send(
    config: ProviderConfig,
    adapter: ProviderAdapter,
    request: NormalizedProviderRequest,
  ): Promise<{ status: number; body: ReadableStream<Uint8Array> | null }>;
};

const sensitiveDiagnosticKey =
  /(?:api[_-]?key|authorization|cookie|password|secret|token)/i;

const safeDiagnosticValue = (value: unknown, depth = 0): unknown => {
  if (depth > 8) return "[TRUNCATED]";
  if (typeof value === "string")
    return value
      .replace(/(Bearer|Basic)\s+[A-Za-z0-9._~+/-]+=*/gi, "$1 [REDACTED]")
      .replace(/(?:sk|sess)-[A-Za-z0-9_-]+/g, "[REDACTED]")
      .slice(0, 8_000);
  if (typeof value === "number" || typeof value === "boolean" || value === null)
    return value;
  if (Array.isArray(value))
    return value
      .slice(0, 100)
      .map((item) => safeDiagnosticValue(item, depth + 1));
  if (!isPlainObject(value)) return String(value).slice(0, 8_000);
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 100)
      .map(([key, item]) => [
        key,
        sensitiveDiagnosticKey.test(key)
          ? "[REDACTED]"
          : safeDiagnosticValue(item, depth + 1),
      ]),
  );
};

export const testProvider = async (
  payload: unknown,
  dependencies: Dependencies,
): Promise<Record<string, unknown>> => {
  const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
  if (
    Object.keys(value).some(
      (key) => !["id", "request", "include_messages"].includes(key),
    )
  )
    fail("INVALID_ARGUMENT");
  const id = value.id;
  const request = value.request;
  const includeMessages = value.include_messages === true;
  if (
    typeof id !== "string" ||
    (value.include_messages !== undefined &&
      typeof value.include_messages !== "boolean")
  )
    fail("INVALID_ARGUMENT");
  if (!isPlainObject(request)) fail("INVALID_ARGUMENT");
  const diagnostics = includeMessages
    ? { request: safeDiagnosticValue(request) }
    : undefined;
  try {
    const config = await dependencies.resolveConfig(id as string);
    const result = await dependencies.send(
      config,
      dependencies.resolveAdapter(config),
      request as unknown as NormalizedProviderRequest,
    );
    const response = await parseProviderBody(result.body);
    parseChatResponse(response);
    return {
      ok: true,
      status: result.status,
      ...(diagnostics
        ? {
            diagnostics: {
              ...diagnostics,
              response: safeDiagnosticValue(response),
            },
          }
        : {}),
    };
  } catch (error) {
    if (!(error instanceof ContractError)) throw error;
    return {
      ok: false,
      code: error.code,
      ...(error.detail ? { detail: error.detail } : {}),
      ...(diagnostics
        ? {
            diagnostics: {
              ...diagnostics,
              error: {
                code: error.code,
                ...(error.detail ? { detail: error.detail } : {}),
              },
            },
          }
        : {}),
    };
  }
};
