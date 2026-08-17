import { fail } from "../security/validation.js";
import { assertSafeRequestPlan } from "./openai-compatible.js";
import type {
  NormalizedProviderRequest,
  ProviderAdapter,
  ProviderConfig,
} from "./types.js";

export type TransportResult = {
  status: number;
  body: ReadableStream<Uint8Array> | null;
};
const reservedHeaders = new Set([
  "content-type",
  "authorization",
  "api-key",
  "x-goog-api-key",
]);
const isPrivateIpv4 = (host: string): boolean => {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
    return false;
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && (parts[1] ?? 0) >= 16 && (parts[1] ?? 0) <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
};
export const validateProviderBaseUrl = (
  raw: string,
  privateNetworkOptIn = false,
): URL => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail("INVALID_ARGUMENT");
  }
  const host = url.hostname.toLowerCase();
  const loopback =
    host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  const privateNetwork = isPrivateIpv4(host);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        (loopback || (privateNetwork && privateNetworkOptIn))
      )) ||
    (privateNetwork && !privateNetworkOptIn)
  )
    return fail("INVALID_ARGUMENT");
  return url;
};
const headerValue = (value: string): string =>
  value.length > 0 &&
  value.length <= 4096 &&
  ![...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  })
    ? value
    : fail("INVALID_ARGUMENT");

export class CoreProviderTransport {
  public constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly timers: {
      set(callback: () => void, milliseconds: number): unknown;
      clear(handle: unknown): void;
    } = {
      set: (callback, milliseconds) => setTimeout(callback, milliseconds),
      clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    },
  ) {}

  public async send(
    config: ProviderConfig,
    adapter: ProviderAdapter,
    request: NormalizedProviderRequest,
    signal?: AbortSignal,
  ): Promise<TransportResult> {
    if (!config.enabled) fail("PROVIDER_NOT_CONFIGURED");
    const base = validateProviderBaseUrl(
      config.base_url,
      config.private_network_opt_in,
    );
    const plan = adapter.plan(request);
    assertSafeRequestPlan(plan);
    const url = new URL(
      `${base.pathname.replace(/\/$/, "")}${plan.path}`,
      base,
    );
    const headers = new Headers({ "Content-Type": "application/json" });
    const seen = new Set<string>();
    for (const header of config.headers) {
      const name = header.name.trim().toLowerCase();
      if (
        !/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(name) ||
        reservedHeaders.has(name) ||
        seen.has(name)
      )
        fail("INVALID_ARGUMENT");
      seen.add(name);
      headers.set(header.name, headerValue(header.value));
    }
    if (config.api_key_header === "none") {
      if (config.api_key) fail("INVALID_ARGUMENT");
    } else {
      const key = headerValue(config.api_key);
      if (config.api_key_header === "authorization_bearer")
        headers.set("Authorization", `Bearer ${key}`);
      else headers.set(config.api_key_header, key);
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    const timeout = this.timers.set(abort, config.timeout_ms);
    try {
      const response = await this.fetcher(url, {
        method: "POST",
        headers,
        body: JSON.stringify(plan.body),
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
      });
      if (response.status === 401 || response.status === 403)
        fail("PROVIDER_AUTH_FAILED");
      if (!response.ok) fail("PROVIDER_UNAVAILABLE");
      const contentType = response.headers.get("content-type") ?? "";
      if (!/(application\/json|text\/event-stream)/i.test(contentType))
        fail("PROVIDER_UNAVAILABLE");
      return { status: response.status, body: response.body };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("PROVIDER_"))
        throw error;
      return fail("PROVIDER_UNAVAILABLE");
    } finally {
      this.timers.clear(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }
}
