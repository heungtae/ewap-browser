import { fail } from "../security/validation.js";
/** Native decisions are bounded JSON; never enter the chat/SSE parser. */
export const readNativeJson = async (
  body: ReadableStream<Uint8Array> | null,
  signal: AbortSignal,
): Promise<unknown> => {
  if (!body) return fail("PROVIDER_UNAVAILABLE");
  const reader = body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (signal.aborted) return fail("POLICY_DENIED");
    for (;;) {
      const chunk = await reader.read();
      if (signal.aborted)
        return fail("PROVIDER_UNAVAILABLE", "decision timed out or aborted");
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 65_536)
        return fail("PROVIDER_UNAVAILABLE", "native response exceeds limit");
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch {
      return fail("PROVIDER_UNAVAILABLE", "invalid native JSON response");
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
};
