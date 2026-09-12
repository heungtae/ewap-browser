import { ContractError } from "../security/validation.js";
import type { BrowserChromeApi, BrowserPort } from "./browser-api.js";
import { createOffscreenReadiness } from "./offscreen-readiness.js";

type ProviderStream = {
  chunks: string[];
  controller?: ReadableStreamDefaultController<Uint8Array> | undefined;
  port?: BrowserPort | undefined;
  ended: boolean;
  cleanup?: () => void;
};

const providerPortPrefix = "contextpilot-provider:";

export const createOffscreenProviderBridge = (
  chromeApi: BrowserChromeApi | undefined,
  newStreamId: () => string,
): {
  fetch: typeof fetch;
  handlePort(port: BrowserPort): boolean;
} => {
  const streams = new Map<string, ProviderStream>();
  const ensureOffscreen = createOffscreenReadiness(chromeApi);

  const flush = (stream: ProviderStream): void => {
    if (!stream.controller) return;
    for (const chunk of stream.chunks)
      stream.controller.enqueue(new TextEncoder().encode(chunk));
    stream.chunks = [];
    if (stream.ended) stream.controller.close();
  };

  const handlePort = (port: BrowserPort): boolean => {
    const streamId = port.name.startsWith(providerPortPrefix)
      ? port.name.slice(providerPortPrefix.length)
      : "";
    if (!/^[A-Za-z0-9_-]{22,128}$/.test(streamId)) return false;
    const api = chromeApi;
    if (
      !api ||
      port.sender?.id !== api.runtime.id ||
      port.sender?.url !== api.runtime.getURL("offscreen/index.html")
    )
      return true;
    const stream = streams.get(streamId);
    if (!stream) {
      port.disconnect?.();
      return true;
    }
    stream.port = port;
    port.onMessage.addListener((message) => {
      if (stream.ended) return;
      if (typeof message !== "object" || message === null) return;
      const value = message as { type?: unknown; text?: unknown };
      if (value.type === "chunk" && typeof value.text === "string") {
        stream.chunks.push(value.text);
        flush(stream);
      } else if (value.type === "end") {
        stream.ended = true;
        flush(stream);
        stream.cleanup?.();
      }
    });
    port.onDisconnect.addListener(() => {
      stream.port = undefined;
      if (!stream.ended) {
        stream.ended = true;
        flush(stream);
      }
      streams.delete(streamId);
      stream.cleanup?.();
    });
    return true;
  };

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const signal = init?.signal;
    signal?.throwIfAborted();
    let stream: ProviderStream | undefined;
    let streamId: string | undefined;
    let rejectAbort: (reason: unknown) => void = () => undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject;
    });
    const cleanup = (): void => signal?.removeEventListener("abort", abort);
    const abort = (): void => {
      const error = new DOMException("Provider request aborted", "AbortError");
      if (stream) {
        if (!stream.ended) stream.controller?.error(error);
        stream.ended = true;
        stream.chunks = [];
        stream.port?.disconnect?.();
      }
      if (streamId) streams.delete(streamId);
      cleanup();
      rejectAbort(error);
    };
    signal?.addEventListener("abort", abort, { once: true });
    const request = async (): Promise<Response> => {
      const url = String(input);
      const headers = Object.fromEntries(new Headers(init?.headers).entries());
      const method = init?.method === "GET" ? "GET" : "POST";
      const body = typeof init?.body === "string" ? init.body : undefined;
      if (method === "POST" && !body)
        throw new ContractError("INVALID_ARGUMENT");
      await ensureOffscreen();
      signal?.throwIfAborted();
      if (!chromeApi) throw new ContractError("PROVIDER_UNAVAILABLE");
      streamId = newStreamId();
      const currentStream: ProviderStream = {
        chunks: [],
        ended: false,
        cleanup,
      };
      stream = currentStream;
      streams.set(streamId, stream);
      const response = await chromeApi.runtime.sendMessage({
        kind: "OFFSCREEN_FETCH",
        stream_id: streamId,
        url,
        method,
        ...(body === undefined ? {} : { body }),
        headers,
      });
      signal?.throwIfAborted();
      if (
        typeof response === "object" &&
        response !== null &&
        (response as { ok?: unknown }).ok === false
      ) {
        const detail = (response as { detail?: unknown }).detail;
        throw new ContractError(
          "PROVIDER_UNAVAILABLE",
          typeof detail === "string"
            ? detail.slice(0, 320)
            : "offscreen provider request failed",
        );
      }
      if (
        typeof response !== "object" ||
        response === null ||
        !(response as { ok?: unknown }).ok ||
        typeof (response as { status?: unknown }).status !== "number" ||
        ((response as { stream?: unknown }).stream !== true &&
          typeof (response as { body?: unknown }).body !== "string")
      )
        throw new ContractError(
          "PROVIDER_UNAVAILABLE",
          "offscreen provider proxy unavailable",
        );
      const result = response as {
        status: number;
        content_type?: string;
        body: string;
        stream?: boolean;
      };
      const responseInit: ResponseInit = { status: result.status };
      if (result.content_type)
        responseInit.headers = { "content-type": result.content_type };
      if (!result.stream) {
        streams.delete(streamId);
        cleanup();
        return new Response(result.body, responseInit);
      }
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            currentStream.controller = controller;
            flush(currentStream);
          },
          cancel() {
            if (streamId) streams.delete(streamId);
            currentStream.chunks = [];
            currentStream.controller = undefined;
            currentStream.ended = true;
            currentStream.port?.disconnect?.();
            cleanup();
          },
        }),
        responseInit,
      );
    };
    try {
      return await Promise.race([request(), aborted]);
    } catch (error) {
      if (streamId) streams.delete(streamId);
      if (stream) {
        stream.ended = true;
        stream.chunks = [];
        stream.port?.disconnect?.();
      }
      cleanup();
      throw error;
    }
  };

  return { fetch, handlePort };
};
