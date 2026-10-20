import { receiptSchema, type Receipt } from "@contextpilot/tool-registry";
import { evidence } from "./evidence.js";
import type { CollectorBudget } from "./budget.js";
import type { DataWindow, WindowAccumulator } from "./windows.js";
export interface WindowDriver {
  page: string;
  target: string;
  mode: "ask" | "act";
  current(): boolean;
  read(signal: AbortSignal): Promise<DataWindow>;
  // Trusted composition must delegate both effects to the shared policy/runtime.
  movement?: {
    authorized(): boolean;
    next(signal: AbortSignal): Promise<Receipt>;
    restore(signal: AbortSignal): Promise<Receipt>;
  };
}
function verified(receipt: Receipt): boolean {
  return (
    receiptSchema.safeParse(receipt).success &&
    receipt.tool === "web.scroll" &&
    receipt.verification === "passed" &&
    (receipt.dispatch === "dispatched" || receipt.noOp)
  );
}
export async function collectWindows(
  driver: WindowDriver,
  accumulator: WindowAccumulator,
  budget: CollectorBudget,
) {
  let moved = false,
    unknown = false,
    restored: boolean | null = null;
  const reasons = new Set<string>();
  try {
    for (let i = 0; i < 50; i++) {
      if (!driver.current()) throw new Error("DOCUMENT_CHANGED");
      const previous = accumulator.count();
      const window = await budget.run(
        driver.page,
        driver.target,
        async (signal) => {
          const value = await driver.read(signal);
          await accumulator.add(value);
          return value;
        },
      );
      if (previous > 0 && accumulator.count() === previous && !window.eof) {
        reasons.add("NO_PROGRESS");
        break;
      }
      if (window.eof) break;
      if (driver.mode === "ask" || !driver.movement) {
        reasons.add("ACT_REQUIRED");
        break;
      }
      if (!driver.movement.authorized()) {
        reasons.add("MOVEMENT_DENIED");
        break;
      }
      const receipt = await budget.run(driver.page, driver.target, (signal) =>
        driver.movement!.next(signal),
      );
      if (!verified(receipt)) {
        unknown = true;
        reasons.add("MOVEMENT_UNKNOWN");
        break;
      }
      moved = true;
    }
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z_]+$/.test(error.message)
        ? error.message
        : "COLLECTION_FAILED";
    reasons.add(code);
    // Effects may have started before a rejected movement result. Do not retry/restore blindly.
    if (moved) unknown = true;
  } finally {
    if (
      moved &&
      !unknown &&
      driver.current() &&
      driver.movement?.authorized()
    ) {
      try {
        restored = verified(
          await budget.run(driver.page, driver.target, (signal) =>
            driver.movement!.restore(signal),
          ),
        );
      } catch {
        restored = false;
      }
    }
    if (moved && restored !== true) reasons.add("RESTORE_FAILED");
  }
  const { digest: _digest, ...body } = await accumulator.finish(
    "dom",
    restored,
  );
  if (reasons.size) {
    body.coverage.status = "partial";
    body.coverage.reasons = [
      ...new Set([...body.coverage.reasons, ...reasons]),
    ].slice(0, 24);
  }
  return evidence(body);
}
