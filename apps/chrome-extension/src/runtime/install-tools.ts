import {
  inputSchemas,
  type Receipt,
  type ToolId,
  type ToolRegistry,
} from "@contextpilot/tool-registry";
import type { ToolContinuation } from "./continuation.js";
const allowed = new Set<ToolId>([
  "web.fill",
  "web.select",
  "web.click",
  "web.navigate",
  "web.switch_tab",
  "web.invoke_action",
]);
// Composition must pass only tools with current reviewed adapters and verifiers.
export function installTools(
  registry: ToolRegistry,
  continuation: ToolContinuation,
  qualified: ReadonlySet<ToolId>,
): void {
  for (const tool of qualified) {
    if (!allowed.has(tool)) throw new Error("EXECUTOR_UNAVAILABLE");
    registry.register(tool, {
      async execute(input, context) {
        const result = await continuation.start(
          tool,
          inputSchemas[tool].parse(input),
          context,
        );
        return {
          tool,
          toolCallId: result.toolCallId,
          status: result.kind === "approval_request" ? "pending" : "completed",
          data: result,
        };
      },
      async verify(_input, _context, result) {
        if (
          result.status !== "completed" ||
          !result.data ||
          typeof result.data !== "object"
        )
          return false;
        const receipt = result.data as Receipt;
        return (
          receipt.tool === tool &&
          receipt.toolCallId === result.toolCallId &&
          receipt.verification === "passed"
        );
      },
    });
  }
}
