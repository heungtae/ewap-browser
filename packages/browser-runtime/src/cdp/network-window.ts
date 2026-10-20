import type { CdpTransport, ObservedResponse } from "./types.js";
import type { ToolContext } from "@contextpilot/tool-registry";
export interface NetworkAccess {
  snapshot(): ObservedResponse[];
  coverage(): { complete: false; reasons: string[] };
  body(id: string, consent: () => void): Promise<string>;
}
export async function networkWindow<T>(
  transport: CdpTransport,
  context: ToolContext,
  signal: AbortSignal,
  origin: string,
  send: (method: string, params: Record<string, unknown>) => Promise<unknown>,
  inspect: (access: NetworkAccess) => Promise<T>,
): Promise<T> {
  const responses = new Map<string, ObservedResponse>();
  const methods = new Map<string, string>();
  const started = Date.now();
  let closed = false;
  let limited = false;
  const stop = transport.listen(context.tabId, (method, input) => {
    if (
      closed ||
      signal.aborted ||
      Date.now() - started >= 30000 ||
      !input ||
      typeof input !== "object"
    )
      return;
    const event = input as Record<string, unknown>;
    const id = event.requestId;
    if (typeof id !== "string" || id.length > 256) return;
    if (method === "Network.requestWillBeSent" && methods.size < 100) {
      const request = event.request as Record<string, unknown> | undefined;
      if (typeof request?.method === "string")
        methods.set(id, request.method.slice(0, 16));
    }
    if (method === "Network.responseReceived" && responses.size >= 100)
      limited = true;
    if (method === "Network.responseReceived" && responses.size < 100) {
      const response = event.response as Record<string, unknown> | undefined;
      if (event.type !== "Fetch" && event.type !== "XHR") return;
      if (
        typeof response?.url !== "string" ||
        response.url.length > 2048 ||
        typeof response.status !== "number" ||
        typeof response.mimeType !== "string"
      )
        return;
      try {
        if (new URL(response.url).origin !== origin) return;
      } catch {
        return;
      }
      responses.set(id, {
        requestId: id,
        url: response.url,
        method: methods.get(id) ?? "OTHER",
        status: response.status,
        mime: response.mimeType.slice(0, 80),
        bytes: null,
        finished: false,
      });
    }
    if (method === "Network.loadingFinished") {
      const response = responses.get(id);
      if (response) {
        response.finished = true;
        response.bytes =
          typeof event.encodedDataLength === "number"
            ? event.encodedDataLength
            : null;
      }
    }
  });
  try {
    await send("Network.enable", {
      maxTotalBufferSize: 262144,
      maxResourceBufferSize: 262144,
      maxPostDataSize: 0,
    });
    return await inspect({
      snapshot: () => structuredClone([...responses.values()]),
      coverage: () => ({
        complete: false,
        reasons: ["NETWORK_WINDOW", ...(limited ? ["RECORD_LIMIT"] : [])],
      }),
      async body(id, consent) {
        if (closed || signal.aborted) throw new Error("NETWORK_CLOSED");
        const response = responses.get(id);
        if (
          !response ||
          !response.finished ||
          response.bytes === null ||
          response.bytes > 262144 ||
          response.bytes < 0 ||
          !/^application\/(?:[a-z0-9.+-]*\+)?json$/i.test(response.mime)
        )
          throw new Error("RESPONSE_UNAVAILABLE");
        consent();
        const raw = (await send("Network.getResponseBody", {
          requestId: id,
        })) as { body?: unknown; base64Encoded?: unknown };
        consent();
        if (
          typeof raw.body !== "string" ||
          raw.base64Encoded !== false ||
          new TextEncoder().encode(raw.body).length > 262144
        )
          throw new Error("RESPONSE_BYTE_LIMIT");
        return raw.body;
      },
    });
  } finally {
    closed = true;
    stop();
    responses.clear();
    methods.clear();
  }
}
