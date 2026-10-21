export async function boundedBody(
  response: Response,
  signal: AbortSignal,
): Promise<string> {
  if (!response.body) throw new Error("ANALYSIS_RESPONSE_EMPTY");
  if (Number(response.headers.get("content-length")) > 262144)
    throw new Error("ANALYSIS_RESPONSE_LIMIT");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0,
    text = "";
  let rejectAbort: ((error: Error) => void) | undefined;
  const interruption = new Promise<never>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abort = () => {
    rejectAbort?.(new Error("ANALYSIS_CANCELLED"));
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) throw new Error("ANALYSIS_CANCELLED");
    while (true) {
      const item = await Promise.race([reader.read(), interruption]);
      if (item.done) break;
      bytes += item.value.byteLength;
      if (bytes > 262144) throw new Error("ANALYSIS_RESPONSE_LIMIT");
      text += decoder.decode(item.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    signal.removeEventListener("abort", abort);
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
export function completedResponse(body: string, streaming: boolean): unknown {
  if (!streaming) return JSON.parse(body);
  let completed: unknown,
    sequence = -1;
  let deltas = "";
  const allowed = new Set([
    "response.created",
    "response.in_progress",
    "response.output_item.added",
    "response.output_item.done",
    "response.content_part.added",
    "response.content_part.done",
    "response.output_text.delta",
    "response.output_text.done",
    "response.reasoning_summary_part.added",
    "response.reasoning_summary_part.done",
    "response.reasoning_summary_text.delta",
    "response.reasoning_summary_text.done",
    "response.completed",
  ]);
  const normalized = body.replace(/\r\n/g, "\n");
  if (!normalized.endsWith("\n\n"))
    throw new Error("ANALYSIS_STREAM_TRUNCATED");
  for (const block of normalized.split("\n\n").filter(Boolean)) {
    const data = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    const event = JSON.parse(data) as Record<string, unknown>;
    if (
      completed ||
      !allowed.has(String(event.type)) ||
      !Number.isSafeInteger(event.sequence_number) ||
      Number(event.sequence_number) <= sequence
    )
      throw new Error("ANALYSIS_STREAM_INVALID");
    sequence = Number(event.sequence_number);
    if (event.type === "response.output_text.delta") {
      if (typeof event.delta !== "string")
        throw new Error("ANALYSIS_STREAM_INVALID");
      deltas += event.delta;
    }
    if (event.type === "response.completed") completed = event.response;
  }
  if (!completed) throw new Error("ANALYSIS_STREAM_TRUNCATED");
  if (deltas) {
    const response = completed as {
      output?: { type: string; content?: { type: string; text?: string }[] }[];
    };
    const final = response.output
      ?.flatMap((i) => i.content ?? [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text)
      .join("");
    if (final !== deltas) throw new Error("ANALYSIS_STREAM_CONFLICT");
  }
  return completed;
}
