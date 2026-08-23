import { fail } from "../security/validation.js";
import {
  maxProviderAssistantChars,
  maxProviderBodyChars,
  providerResponseTooLarge,
} from "./response-limits.js";
import { parseSseProviderBody } from "./sse-response.js";

export const parseProviderBody = async (
  body: ReadableStream<Uint8Array> | null,
  onDelta?: (text: string) => void,
): Promise<unknown> => {
  if (!body) return fail("PROVIDER_UNAVAILABLE");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let pending = "";
  let isSse = false;
  let streamedAssistantChars = 0;
  const emitDelta = (delta: string): void => {
    streamedAssistantChars += delta.length;
    if (streamedAssistantChars > maxProviderAssistantChars)
      providerResponseTooLarge();
    onDelta?.(delta);
  };
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = decoder.decode(next.value, { stream: true });
      if (text.length + chunk.length > maxProviderBodyChars)
        providerResponseTooLarge();
      text += chunk;
      pending += chunk;
      if (pending.length > maxProviderBodyChars) providerResponseTooLarge();
      let newline = pending.indexOf("\n");
      while (newline >= 0) {
        const line = pending.slice(0, newline).replace(/\r$/, "");
        pending = pending.slice(newline + 1);
        if (line.startsWith("data:")) {
          isSse = true;
          parseSseProviderBody(line, emitDelta, true);
        }
        newline = pending.indexOf("\n");
      }
    }
    const tail = decoder.decode();
    if (text.length + tail.length > maxProviderBodyChars)
      providerResponseTooLarge();
    text += tail;
    if (isSse || text.split(/\r?\n/).some((line) => line.startsWith("data:")))
      return parseSseProviderBody(text);
    try {
      return JSON.parse(text);
    } catch {
      return fail("PROVIDER_UNAVAILABLE");
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
};
