type FetchMessage = {
  kind: "OFFSCREEN_FETCH";
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
};
type Runtime = {
  id: string;
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
    (value.method !== "GET" && value.method !== "POST") ||
    typeof value.headers !== "object" ||
    value.headers === null ||
    (value.method === "POST" && typeof value.body !== "string")
  ) {
    respond(safeFailure("INVALID_ARGUMENT"));
    return;
  }
  void fetch(value.url, {
    method: value.method,
    headers: value.headers,
    ...(value.body === undefined ? {} : { body: value.body }),
    credentials: "omit",
    redirect: "error",
  })
    .then(async (response) =>
      respond({
        ok: true,
        status: response.status,
        content_type: response.headers.get("content-type") ?? "",
        body: await response.text(),
      }),
    )
    .catch(() =>
      respond(
        safeFailure("PROVIDER_UNAVAILABLE", "network/CORS/PNA request failed"),
      ),
    );
  return true;
});
