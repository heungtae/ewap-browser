import { receiptSchema } from "../../../../packages/tool-registry/src/contracts.js";

// Treat missing, malformed, mismatched and unsettled receipts as uncertain.
export function receiptUncertain(row: Record<string, unknown>): boolean {
  if (!row.receipt) return true;
  try {
    const receipt = receiptSchema.parse(JSON.parse(String(row.receipt)));
    return (
      receipt.dispatchId !== row.id ||
      receipt.dispatchId !== `dispatch_${receipt.toolCallId}` ||
      receipt.preparedDigest !== row.digest ||
      receipt.stepId !== row.step_id ||
      (receipt.dispatch === "not_dispatched" &&
        (receipt.commands !== 0 || receipt.verification !== "not_run")) ||
      (receipt.verification === "passed" && receipt.evidenceDigest === null) ||
      receipt.dispatch === "reserved" ||
      receipt.dispatch === "unknown" ||
      (receipt.dispatch === "dispatched" && receipt.verification !== "passed")
    );
  } catch {
    return true;
  }
}
