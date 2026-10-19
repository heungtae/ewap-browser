/** Bounded native JSON reader; abort cancels the stream and cannot return partial JSON. */
export async function readNativeJson(
  body: ReadableStream<Uint8Array> | null,
  signal: AbortSignal,
  maximum = 65536,
): Promise<unknown> {
  if (!body || signal.aborted) throw new Error("INVALID_NATIVE_BODY");
  const reader = body.getReader(),
    chunks: Uint8Array[] = [];
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (signal.aborted) throw new Error("CONTROLLER_TIMEOUT");
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maximum) throw new Error("NATIVE_RESPONSE_BYTE_LIMIT");
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } finally {
    await reader.cancel().catch(() => undefined);
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
