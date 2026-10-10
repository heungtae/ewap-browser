export type MaskReport = {
  masked: boolean;
  fields: Array<{ path: string; reason: string; count: number }>;
  truncated: boolean;
};
const knownSecrets = new Set<string>();
const credentialKey =
  /(?:password|passwd|secret|credential|cookie|authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key)/i;
const privateKey =
  /^(?:.*(?:password|passwd|secret|credential|cookie|authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|private[_-]?key|nonce)|function_paths|function_name|functionPath|functionPaths|functionName|entrypoint|raw_result|workflowResourceCandidates|declaration|user_value_source|boundary_characters|source_text|description|subtree_rows|excerpt|record|row|cell|chunk|headers?|value|raw|records|rows|cells|cursor|selector|locator|endpoint|function_path|ref_id|source_ref|candidate_ref|data_url|image_data_urls|image|source|html|script|textContent|innerHTML|host|hostname|origin|path|url|token|refId|targetRefId|document_id|documentEpoch|document_epoch|page_scope_epoch|profile_jws|jws|text_value|input_value|arguments|args|classifier_response|output_text|refusal|user_input|target_name|targetName|goal|intent|postcondition|side_effects|provenance|origin_diff|coverage_note|summary|suggested_value|suggested_value_tail|prompt|question|answer|response_text|text|approval_reason|approvalReason|rationale|reasoning|reasoning_details)$/i;
/** No getters, DOM values, arbitrary class internals or collection cells are read. */
export const maskTraceValue = (
  input: unknown,
): { data: unknown; masking: MaskReport } => {
  const masking: MaskReport = { masked: false, fields: [], truncated: false };
  const seen = new WeakSet<object>();
  const scanned = new WeakSet<object>();
  const collect = (value: unknown, depth = 0): void => {
    if (!value || typeof value !== "object" || depth > 7 || scanned.has(value))
      return;
    scanned.add(value);
    if (
      Object.getPrototypeOf(value) !== Object.prototype &&
      !Array.isArray(value)
    )
      return;
    for (const [key, field] of Object.entries(
      Object.getOwnPropertyDescriptors(value),
    ).slice(0, 64)) {
      if (!("value" in field)) continue;
      const child: unknown = field.value;
      if (
        (credentialKey.test(key) ||
          /^(?:function_paths?|function_?name|functionPaths?|functionName|entrypoint)$/i.test(
            key,
          )) &&
        typeof child === "string" &&
        child.length >= 6 &&
        child.length <= 4096 &&
        knownSecrets.size < 256
      )
        knownSecrets.add(child);
      else collect(child, depth + 1);
    }
  };
  collect(input);
  let budget = 24_000;
  const mark = (path: string, reason: string, count = 1): string => {
    masking.masked = true;
    if (masking.fields.length < 80)
      masking.fields.push({ path, reason, count });
    else masking.truncated = true;
    return `[MASKED:${reason}]`;
  };
  const text = (value: string, path: string): string => {
    for (const url of value.match(/https?:\/\/[^\s"'<>]+/gi) ?? []) {
      try {
        const host = new URL(url).hostname;
        if (knownSecrets.size < 256 && host.length > 3) knownSecrets.add(host);
      } catch {
        /* Invalid URLs are still masked below. */
      }
    }
    let result = value;
    for (const secret of knownSecrets) {
      if (result.includes(secret))
        result = result.split(secret).join(mark(path, "known_credential"));
    }
    for (const [pattern, reason] of [
      [
        /\b[A-Z0-9]+(?:_[A-Z0-9]+)*_(?:SECRET|PRIVATE)_[A-Z0-9_]+\b/g,
        "secret_marker",
      ],
      [/\bBearer\s+[^\s"'<>]+/gi, "bearer_token"],
      [/\b(?:sk|pk)[-_][A-Za-z0-9_-]{12,}\b/g, "api_key"],
      [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "jwt"],
      [
        /(?:password|passwd|secret|api[_ -]?key|access[_ -]?token|비밀번호|암호|인증키)["']?\s*(?:[=:：]|is|는|은)\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
        "credential_assignment",
      ],
      [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "email"],
      [
        /\b(?:01[016789][- ]?\d{3,4}[- ]?\d{4}|\d{6}-[1-4]\d{6})\b/g,
        "personal_identifier",
      ],
      [/https?:\/\/[^\s"'<>]+/gi, "url"],
      [/data:[^\s"']+/gi, "data_url"],
    ] as const) {
      result = result.replace(pattern, () => mark(path, reason));
    }
    const limit = Math.min(8_000, budget);
    if (result.length > limit) {
      masking.truncated = true;
      result = result.slice(0, limit) + "[TRUNCATED]";
    }
    budget = Math.max(0, budget - result.length);
    return result;
  };
  const visit = (value: unknown, path: string, depth: number): unknown => {
    if (value === null || value === undefined) return value ?? null;
    if (typeof value === "string") {
      if (/^\s*[[{]/.test(value) && value.length <= 200_000) {
        try {
          const parsed: unknown = JSON.parse(value);
          collect(parsed);
          return visit(parsed, path + ".json", depth + 1);
        } catch {
          /* Plain text remains useful. */
        }
      }
      const wrapped = value.replace(
        /\[(UNTRUSTED_[A-Z_]+)\]\s*([\s\S]*?)\s*\[\/\1\]/g,
        (whole: string, tag: string, body: string) => {
          try {
            const parsed: unknown = JSON.parse(body);
            collect(parsed);
            return `[${tag}]\n${JSON.stringify(visit(parsed, `${path}.${tag}`, depth + 1))}\n[/${tag}]`;
          } catch {
            return `[${tag}]${mark(path, "unstructured_context")}[/${tag}]`;
          }
        },
      );
      return text(wrapped, path);
    }
    if (typeof value === "boolean" || typeof value === "number") return value;
    if (typeof value !== "object") return `[${typeof value}]`;
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    if (depth > 7 || budget <= 0) {
      masking.truncated = true;
      return "[TRUNCATED]";
    }
    if (value instanceof Error)
      return {
        name: text(value.name, path + ".name"),
        message: text(value.message, path + ".message"),
        ...(typeof Object.getOwnPropertyDescriptor(value, "stack")?.value ===
        "string"
          ? {
              stack: text(
                Object.getOwnPropertyDescriptor(value, "stack")!
                  .value as string,
                path + ".stack",
              ),
            }
          : {}),
        ...("code" in value
          ? { code: visit(value.code, path + ".code", depth + 1) }
          : {}),
      };
    if (Array.isArray(value)) {
      if (value.length > 32) masking.truncated = true;
      return value
        .slice(0, 32)
        .map((item, index) => visit(item, `${path}[${index}]`, depth + 1));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
      return mark(path, "opaque_instance");
    const entries = Object.entries(Object.getOwnPropertyDescriptors(value));
    if (entries.length > 64) masking.truncated = true;
    const result = Object.create(null) as Record<string, unknown>;
    for (const [key, descriptor] of entries.slice(0, 64)) {
      const safeKey = text(key, path + ".key");
      const fieldPath = `${path}.${safeKey}`;
      if (!("value" in descriptor)) {
        result[safeKey] = mark(fieldPath, "accessor");
        continue;
      }
      const child: unknown = descriptor.value;
      // User/provider prose can echo arbitrary input values. Keep structured
      // untrusted contexts inspectable through their field-level masking.
      const prose =
        typeof child === "string" &&
        ((key === "content" &&
          !/^\[(UNTRUSTED_[A-Z_]+)\][\s\S]*\[\/\1\]$/.test(child)) ||
          ["result", "detail", "body", "delta", "message", "query"].includes(
            key,
          ));
      if (privateKey.test(key) || prose) {
        result[safeKey] = {
          masked: mark(fieldPath, "sensitive_field"),
          ...(typeof child === "string" || Array.isArray(child)
            ? { count: child.length }
            : {}),
        };
      } else result[safeKey] = visit(child, fieldPath, depth + 1);
    }
    return result;
  };
  return { data: visit(input, "$", 0), masking };
};
