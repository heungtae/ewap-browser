/**
 * Serialized into the page MAIN world. It deliberately has no imports,
 * closures, page-supplied arguments, or return values that identify a path,
 * URL, source snippet, or page value.
 */
export const fixedRedactedDiscoveryScanner = (): {
  hints: Array<{
    kind: "public_js_function_hint" | "script_endpoint_hint";
    confidence: "low" | "medium";
    evidence: string[];
    limitations: string[];
  }>;
  truncated: boolean;
} => {
  const approvedRoots = ["appData", "gridApi", "chartManager", "demoControls"];
  const maxProperties = 32;
  const maxFunctions = 64;
  const maxEndpointHints = 32;
  const maxScriptChars = 64 * 1024;
  const maxTotalScriptChars = 256 * 1024;
  const hints: Array<{
    kind: "public_js_function_hint" | "script_endpoint_hint";
    confidence: "low" | "medium";
    evidence: string[];
    limitations: string[];
  }> = [];
  let truncated = false;
  let functionCount = 0;
  let endpointCount = 0;

  for (const rootName of approvedRoots) {
    if (functionCount >= maxFunctions) {
      truncated = true;
      break;
    }
    try {
      const rootDescriptor = Object.getOwnPropertyDescriptor(
        globalThis,
        rootName,
      );
      const root = rootDescriptor?.value;
      if (!root || (typeof root !== "object" && typeof root !== "function"))
        continue;
      const names = Object.getOwnPropertyNames(root);
      if (names.length > maxProperties) truncated = true;
      for (const name of names.slice(0, maxProperties)) {
        if (functionCount >= maxFunctions) {
          truncated = true;
          break;
        }
        const descriptor = Object.getOwnPropertyDescriptor(root, name);
        if (!descriptor || typeof descriptor.value !== "function") continue;
        hints.push({
          kind: "public_js_function_hint",
          confidence: "medium",
          evidence: ["OWN_DATA_DESCRIPTOR", "FUNCTION_SHAPE"],
          limitations: [
            "UNTRUSTED_MAIN_WORLD",
            "NO_EXECUTION",
            "NO_EXTERNAL_SCRIPT",
            "POSSIBLE_REFLECTION_TRAP",
          ],
        });
        functionCount++;
      }
    } catch {
      // A hostile Proxy/host object is untrusted input; omit it without
      // returning page-controlled errors or trying a different reflection path.
    }
  }

  let remainingChars = maxTotalScriptChars;
  for (const script of Array.from(document.scripts)) {
    if (endpointCount >= maxEndpointHints || remainingChars <= 0) {
      truncated = true;
      break;
    }
    if (script.src) continue;
    const raw = script.textContent ?? "";
    const source = raw.slice(0, Math.min(maxScriptChars, remainingChars));
    remainingChars -= source.length;
    if (raw.length > source.length) truncated = true;
    const matches = source.match(
      /\b(?:fetch|axios(?:\.(?:get|post|put|patch|delete|request))?)\s*\(\s*["'`]/g,
    );
    const count = Math.min(
      matches?.length ?? 0,
      maxEndpointHints - endpointCount,
    );
    if ((matches?.length ?? 0) > count) truncated = true;
    for (let index = 0; index < count; index++) {
      hints.push({
        kind: "script_endpoint_hint",
        confidence: "low",
        evidence: ["INLINE_SCRIPT_LITERAL_PATTERN"],
        limitations: [
          "UNTRUSTED_MAIN_WORLD",
          "NO_EXECUTION",
          "NO_EXTERNAL_SCRIPT",
        ],
      });
      endpointCount++;
    }
  }
  return { hints, truncated };
};
