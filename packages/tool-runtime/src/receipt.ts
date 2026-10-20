import {
  receiptSchema,
  type PreparedStep,
  type Receipt,
} from "@contextpilot/tool-registry";
export function receipt(
  step: PreparedStep,
  patch: Partial<Receipt> = {},
): Receipt {
  return receiptSchema.parse({
    schema: "wca.tool/v1",
    kind: "receipt",
    toolCallId: step.toolCallId,
    tool: step.tool,
    stepId: step.context.stepId,
    preparedDigest: step.digest,
    dispatchId: `dispatch_${step.toolCallId}`,
    dispatch: "not_dispatched",
    commands: 0,
    verification: "not_run",
    evidenceDigest: null,
    error: null,
    noOp: false,
    goalVerified: false,
    ...patch,
  });
}
export function safeError(error: unknown): string {
  return error instanceof Error && /^[A-Z][A-Z0-9_]{0,127}$/.test(error.message)
    ? error.message
    : "RUNTIME_ERROR";
}
