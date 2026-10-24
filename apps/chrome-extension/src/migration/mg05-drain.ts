import { digestCanonical } from "../../../../extension/src/security/canonical.js";
import { convertMg05, type ExecutionSnapshot } from "./mg05-convert.js";
import {
  legacyRequestSchema,
  dispatchPossible,
  dispatchUnknown,
  type LegacyRequest,
} from "./mg05-request.js";
export interface LegacyDrainPort {
  assertFrozen(epoch: number): Promise<void>;
  cancelRequest(row: LegacyRequest, signal: AbortSignal): Promise<void>;
  readRequest(
    row: LegacyRequest,
    signal: AbortSignal,
  ): Promise<unknown | undefined>;
  revokeSelections(signal: AbortSignal): Promise<number>;
  remainingActive(signal: AbortSignal): Promise<number>;
  reconcileOwnedCdp(signal: AbortSignal): Promise<number>;
}
// This is reconciliation only. It has no dispatch, receipt synthesis, task
// creation, admission-open or runtime-pointer operation.
export async function drainLegacy(
  port: LegacyDrainPort,
  snapshot: ExecutionSnapshot,
  epoch: number,
  timeoutMs = 5000,
) {
  if (
    !Number.isSafeInteger(epoch) ||
    epoch < 1 ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30000
  )
    throw new Error("MG05_DRAIN_BOUND");
  const source = structuredClone(snapshot);
  const conversion = convertMg05(source);
  if (conversion.quarantine.length) throw new Error("MG05_INVALID_SOURCE");
  const rows = (
    (source.execution_requests_v1 as unknown[] | undefined) ?? []
  ).map((row) => legacyRequestSchema.parse(row));
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = async () => {
    const check = async () => {
      if (abort.signal.aborted) throw new Error("MG05_DRAIN_TIMEOUT");
      await port.assertFrozen(epoch);
      if (abort.signal.aborted) throw new Error("MG05_DRAIN_TIMEOUT");
    };
    let unknownDispatches = 0,
      activeRemaining = 0;
    const observations: LegacyRequest[] = [];
    await check();
    for (const row of rows) {
      await check();
      if (row.state !== "TERMINAL") {
        await port.cancelRequest(row, abort.signal);
        await check();
      }
      const current = await port.readRequest(row, abort.signal);
      await check();
      if (current === undefined && row.state !== "TERMINAL") {
        activeRemaining++;
        unknownDispatches++;
        observations.push(row);
        continue;
      }
      const observed =
        current === undefined ? row : legacyRequestSchema.parse(current);
      if (
        observed.request_id !== row.request_id ||
        observed.tab_id !== row.tab_id ||
        observed.owner !== row.owner ||
        observed.revision < row.revision ||
        (observed.revision === row.revision &&
          digestCanonical(observed) !== digestCanonical(row))
      )
        throw new Error("MG05_OBSERVATION_BINDING");
      // A cancellation result cannot erase an earlier dispatch marker.
      const merged = {
        ...observed,
        ...(dispatchPossible(row) ? { dispatch_started: true as const } : {}),
      };
      observations.push(merged);
      if (merged.state !== "TERMINAL") activeRemaining++;
      if (dispatchUnknown(merged)) unknownDispatches++;
    }
    await check();
    const remainingSelections = await port.revokeSelections(abort.signal);
    await check();
    const remaining = await port.remainingActive(abort.signal);
    await check();
    const unresolvedCdp = await port.reconcileOwnedCdp(abort.signal);
    await check();
    if (
      ![unresolvedCdp, remaining, remainingSelections].every(
        (count) => Number.isSafeInteger(count) && count >= 0,
      )
    )
      throw new Error("MG05_CDP_RESULT");
    activeRemaining = Math.max(activeRemaining, remaining);
    return {
      epoch,
      sourceDigest: digestCanonical(source),
      observationsDigest: digestCanonical(observations),
      observedRequests: observations.length,
      activeRemaining,
      unknownDispatches,
      unresolvedCdp,
      remainingSelections,
      ready:
        activeRemaining === 0 &&
        unknownDispatches === 0 &&
        unresolvedCdp === 0 &&
        remainingSelections === 0,
      archive: convertMg05({ execution_requests_v1: observations }),
    };
  };
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(new Error("MG05_DRAIN_TIMEOUT"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    abort.abort();
  }
}
