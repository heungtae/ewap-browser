type FetchMessage = {
  kind: "OFFSCREEN_FETCH";
  stream_id: string;
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
};
type Runtime = {
  id: string;
  connect(info: { name: string }): {
    postMessage(message: unknown): void;
    disconnect(): void;
    onDisconnect: { addListener(listener: () => void): void };
  };
  onMessage: {
    addListener(
      listener: (
        message: unknown,
        sender: { id?: string; url?: string },
        respond: (response: unknown) => void,
      ) => boolean | void,
    ): void;
  };
};
const chromeApi = (
  globalThis as typeof globalThis & {
    chrome?: { runtime: Runtime };
  }
).chrome;
const runtime = chromeApi?.runtime;
const maxProviderStreamBytes = 2 * 1024 * 1024;
const safeFailure = (code: string, detail?: string) => ({
  ok: false,
  code,
  ...(detail ? { detail } : {}),
});

runtime?.onMessage.addListener((message, sender, respond) => {
  if (
    typeof message !== "object" ||
    message === null ||
    (message as { kind?: unknown }).kind !== "OFFSCREEN_FETCH"
  )
    return;
  const value = message as Partial<FetchMessage>;
  if (
    sender.id !== runtime.id ||
    typeof value.url !== "string" ||
    typeof value.stream_id !== "string" ||
    !/^[A-Za-z0-9_-]{22,128}$/.test(value.stream_id) ||
    (value.method !== "GET" && value.method !== "POST") ||
    typeof value.headers !== "object" ||
    value.headers === null ||
    (value.method === "POST" && typeof value.body !== "string")
  ) {
    respond(safeFailure("INVALID_ARGUMENT"));
    return;
  }
  const port = runtime.connect({
    name: `contextpilot-provider:${value.stream_id}`,
  });
  const abort = new AbortController();
  let responded = false;
  const respondOnce = (response: unknown): void => {
    if (responded) return;
    responded = true;
    respond(response);
  };
  port.onDisconnect.addListener(() => abort.abort());
  void fetch(value.url, {
    method: value.method,
    headers: value.headers,
    ...(value.body === undefined ? {} : { body: value.body }),
    credentials: "omit",
    redirect: "error",
    signal: abort.signal,
  })
    .then(async (response) => {
      respondOnce({
        ok: true,
        stream: true,
        status: response.status,
        content_type: response.headers.get("content-type") ?? "",
      });
      const reader = response.body?.getReader();
      if (!reader) {
        port.postMessage({ type: "end" });
        port.disconnect();
        return;
      }
      const decoder = new TextDecoder();
      let received = 0;
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        received += chunk.value.byteLength;
        if (received > maxProviderStreamBytes) {
          abort.abort();
          break;
        }
        const text = decoder.decode(chunk.value, { stream: true });
        if (text) port.postMessage({ type: "chunk", text });
      }
      if (abort.signal.aborted) {
        port.disconnect();
        return;
      }
      const tail = decoder.decode();
      if (tail) port.postMessage({ type: "chunk", text: tail });
      port.postMessage({ type: "end" });
      port.disconnect();
    })
    .catch(() => {
      port.disconnect();
      respondOnce(
        safeFailure("PROVIDER_UNAVAILABLE", "network/CORS/PNA request failed"),
      );
    });
  return true;
});
