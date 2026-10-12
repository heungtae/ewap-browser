import type { ProviderMessage } from "../providers/types.js";

/** Evidence IDs are accepted only from successful read_page_resource tool results. */
export const pageMethodSourceEvidence = (
  messages: readonly ProviderMessage[],
  requestRevision?: number,
): ReadonlyMap<string, string> => {
  const reads = new Set<string>();
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const call of message.tool_calls ?? [])
      if (call.name === "read_page_resource") reads.add(call.id);
  }
  const evidence = new Map<string, string>();
  for (const message of messages) {
    if (
      message.role !== "tool" ||
      !message.tool_call_id ||
      !reads.has(message.tool_call_id)
    )
      continue;
    const wrapped = message.content.match(
      /\[UNTRUSTED_TOOL_RESULT\]\n([^]*?)\n\[\/UNTRUSTED_TOOL_RESULT\]/,
    );
    if (!wrapped) continue;
    try {
      const result: unknown = JSON.parse(wrapped[1]!);
      if (
        typeof result !== "object" ||
        result === null ||
        Array.isArray(result)
      )
        continue;
      const record = result as Record<string, unknown>;
      const text =
        typeof record.content === "object" && record.content !== null
          ? (record.content as Record<string, unknown>).text
          : undefined;
      if (
        record.status === "AVAILABLE" &&
        (requestRevision === undefined ||
          record.request_revision === requestRevision) &&
        ["inline_script", "external_script"].includes(String(record.kind)) &&
        typeof record.evidence_id === "string" &&
        typeof text === "string"
      )
        evidence.set(record.evidence_id, text);
    } catch {
      // Malformed or unavailable read output is never grounding evidence.
    }
  }
  return evidence;
};
