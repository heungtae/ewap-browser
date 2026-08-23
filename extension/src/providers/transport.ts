import { fail } from "../security/validation.js";
import { assertSafeRequestPlan } from "./openai-compatible.js";
import {
  providerHeaders,
  safeProviderErrorDetail,
  validateProviderBaseUrl,
} from "./provider-request.js";
import type {
  NormalizedProviderRequest,
  ProviderAdapter,
  ProviderConfig,
} from "./types.js";

export { validateProviderBaseUrl } from "./provider-request.js";

export type TransportResult = {
  status: number;
  body: ReadableStream<Uint8Array> | null;
};

type Timers = {
  set(callback: () => void, milliseconds: number): unknown;
  clear(handle: unknown): void;
};

const defaultTimers: Timers = {
  set: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const providerFailure = (error: unknown): never =>
  fail(
    "PROVIDER_UNAVAILABLE",
    error instanceof Error && error.name === "AbortError"
      ? "request timed out or was aborted"
      : "network/CORS/PNA request failed",
  );

const assertResponse = async (
  response: Response,
  contentType: RegExp,
): Promise<void> => {
  if (response.status === 401 || response.status === 403)
    fail(
      "PROVIDER_AUTH_FAILED",
      `HTTP ${response.status}; provider rejected credentials`,
    );
  if (!response.ok)
    fail("PROVIDER_UNAVAILABLE", await safeProviderErrorDetail(response));
  if (!contentType.test(response.headers.get("content-type") ?? ""))
    fail("PROVIDER_UNAVAILABLE", "invalid response content type");
};

export class CoreProviderTransport {
  public constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly timers: Timers = defaultTimers,
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
    const headers = providerHeaders(config);
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
      await assertResponse(response, /(application\/json|text\/event-stream)/i);
      return { status: response.status, body: response.body };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("PROVIDER_"))
        throw error;
      return providerFailure(error);
    } finally {
      this.timers.clear(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  public async listModels(
    config: ProviderConfig,
    path = "/models",
  ): Promise<{ status: number; models: string[] }> {
    if (!config.enabled) fail("PROVIDER_NOT_CONFIGURED");
    const base = validateProviderBaseUrl(
      config.base_url,
      config.private_network_opt_in,
    );
    const url = new URL(`${base.pathname.replace(/\/$/, "")}${path}`, base);
    const headers = providerHeaders(config);
    const controller = new AbortController();
    const timeout = this.timers.set(
      () => controller.abort(),
      config.timeout_ms,
    );
    try {
      const response = await this.fetcher(url, {
        method: "GET",
        headers,
        signal: controller.signal,
        credentials: "omit",
        redirect: "error",
      });
      await assertResponse(response, /application\/json/i);
      const value = JSON.parse(await response.text()) as {
        data?: Array<{ id?: unknown }>;
        models?: Array<{ name?: unknown }>;
      };
      const models = [
        ...(value.data ?? []).map((model) => model.id),
        ...(value.models ?? []).map((model) => model.name),
      ].filter((model): model is string => typeof model === "string");
      return { status: response.status, models };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("PROVIDER_"))
        throw error;
      return providerFailure(error);
    } finally {
      this.timers.clear(timeout);
    }
  }
}
