import { ContractError } from "../security/validation.js";
import type { BrowserChromeApi, BrowserPort } from "./browser-api.js";

type ProviderStream = {
  chunks: string[];
  controller?: ReadableStreamDefaultController<Uint8Array> | undefined;
  port?: BrowserPort | undefined;
  ended: boolean;
};

const providerPortPrefix = "contextpilot-provider:";
const providerReadyCheckKind = "OFFSCREEN_PROVIDER_READY_CHECK";
const providerReadyKind = "OFFSCREEN_PROVIDER_READY";
const offscreenReadyAttempts = 20;
const offscreenReadyRetryMs = 50;

export const createOffscreenProviderBridge = (
  chromeApi: BrowserChromeApi | undefined,
  newStreamId: () => string,
): {
  fetch: typeof fetch;
  handlePort(port: BrowserPort): boolean;
} => {
  const streams = new Map<string, ProviderStream>();
  let offscreenReady: Promise<void> | undefined;

  const flush = (stream: ProviderStream): void => {
    if (!stream.controller) return;
    for (const chunk of stream.chunks)
      stream.controller.enqueue(new TextEncoder().encode(chunk));
    stream.chunks = [];
    if (stream.ended) stream.controller.close();
  };

  const ensureOffscreen = async (): Promise<void> => {
    const offscreen = chromeApi?.offscreen;
    if (!offscreen || !chromeApi)
      throw new ContractError("PROVIDER_UNAVAILABLE");
    let documentExists =
      offscreen.hasDocument && (await offscreen.hasDocument());
    const offscreenUrl = chromeApi.runtime.getURL("offscreen/index.html");
    if (!documentExists && chromeApi.runtime.getContexts) {
      const contexts = await chromeApi.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [offscreenUrl],
      });
      documentExists = contexts.length > 0;
    }
    if (!documentExists) {
      offscreenReady ??= offscreen
        .createDocument({
          url: "offscreen/index.html",
          reasons: ["BLOBS"],
          justification: "Proxy provider requests from a document context.",
        })
        .catch((error: unknown) => {
          offscreenReady = undefined;
          throw error;
        });
      await offscreenReady;
    }
    for (let attempt = 0; attempt < offscreenReadyAttempts; attempt += 1) {
      try {
        const response = await chromeApi.runtime.sendMessage({
          kind: providerReadyCheckKind,
        });
        if (
          typeof response === "object" &&
          response !== null &&
          (response as { kind?: unknown }).kind === providerReadyKind
        )
          return;
      } catch {
        // The document can exist before its module has registered a listener.
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, offscreenReadyRetryMs);
      });
    }
    throw new ContractError(
      "PROVIDER_UNAVAILABLE",
      "offscreen provider proxy did not become ready",
    );
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
    if (!stream) return true;
    stream.port = port;
    port.onMessage.addListener((message) => {
      if (typeof message !== "object" || message === null) return;
      const value = message as { type?: unknown; text?: unknown };
      if (value.type === "chunk" && typeof value.text === "string") {
        stream.chunks.push(value.text);
        flush(stream);
      } else if (value.type === "end") {
        stream.ended = true;
        flush(stream);
      }
    });
    port.onDisconnect.addListener(() => {
      stream.port = undefined;
      if (!stream.ended) {
        stream.ended = true;
        flush(stream);
      }
      streams.delete(streamId);
    });
    return true;
  };

  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const method = init?.method === "GET" ? "GET" : "POST";
    const body = typeof init?.body === "string" ? init.body : undefined;
    if (method === "POST" && !body) throw new ContractError("INVALID_ARGUMENT");
    await ensureOffscreen();
    if (!chromeApi) throw new ContractError("PROVIDER_UNAVAILABLE");
    const streamId = newStreamId();
    const stream: ProviderStream = { chunks: [], ended: false };
    streams.set(streamId, stream);
    const response = await chromeApi.runtime.sendMessage({
      kind: "OFFSCREEN_FETCH",
      stream_id: streamId,
      url,
      method,
      ...(body === undefined ? {} : { body }),
      headers,
    });
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
      return new Response(result.body, responseInit);
    }
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          stream.controller = controller;
          flush(stream);
        },
        cancel() {
          streams.delete(streamId);
          stream.chunks = [];
          stream.controller = undefined;
          stream.ended = true;
          stream.port?.disconnect?.();
        },
      }),
      responseInit,
    );
  };

  return { fetch, handlePort };
};
