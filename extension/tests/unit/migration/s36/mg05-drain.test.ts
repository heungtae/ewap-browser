import { expect, it } from "vitest";
import { drainLegacy } from "../../../../../apps/chrome-extension/src/migration/mg05-drain.js";
import { activeLegacy, archivedRequest } from "./mg05-support.js";
it("uses the real lifecycle to cancel a pre-dispatch request and revoke pending selections", async () => {
  const f = await activeLegacy();
  const oldContext = f.requests.context(f.id);
  try {
    const result = await drainLegacy(f.port, f.snapshot(), 1);
    expect(oldContext.signal.aborted).toBe(true);
    expect(() => oldContext.check()).toThrow("POLICY_DENIED");
    expect(f.status()?.state).toBe("TERMINAL");
    expect(f.status()?.outcome).toBe("CANCELLED");
    expect(result).toMatchObject({
      ready: true,
      activeRemaining: 0,
      unknownDispatches: 0,
      unresolvedCdp: 0,
    });
    expect(f.counts()).toEqual({ cancellations: 1, revoked: 1 });
  } finally {
    f.cleanup();
  }
});
it("real dispatch marker cancellation remains UNKNOWN and blocks migration readiness", async () => {
  const f = await activeLegacy(true);
  try {
    const result = await drainLegacy(f.port, f.snapshot(), 1);
    expect(f.status()?.outcome).toBe("UNKNOWN");
    expect(result).toMatchObject({ ready: false, unknownDispatches: 1 });
    expect(result.archive.records[0]?.metadata.dispatchUncertain).toBe(true);
  } finally {
    f.cleanup();
  }
});
it.each([{ dispatch_started: true }, { outcome: "UNKNOWN" }])(
  "cannot erase earlier uncertainty through a lower-information cancellation response: %j",
  async (hint) => {
    const f = await activeLegacy();
    try {
      const snapshot = f.snapshot();
      Object.assign(
        (snapshot.execution_requests_v1 as Record<string, unknown>[])[0]!,
        hint,
      );
      const result = await drainLegacy(f.port, snapshot, 1);
      expect(result.ready).toBe(false);
      expect(result.unknownDispatches).toBe(1);
    } finally {
      f.cleanup();
    }
  },
);
it("unresolved CDP cleanup and revoked epochs cannot qualify a drained runtime", async () => {
  const f = await activeLegacy();
  try {
    f.cdpUnknown();
    expect((await drainLegacy(f.port, f.snapshot(), 1)).ready).toBe(false);
    f.unfreeze();
    await expect(drainLegacy(f.port, f.snapshot(), 1)).rejects.toThrow(
      "FENCE_REVOKED",
    );
  } finally {
    f.cleanup();
  }
});
it("missing live state does not turn an active snapshot into a terminal result", async () => {
  const f = await activeLegacy();
  try {
    const result = await drainLegacy(
      {
        ...f.port,
        async cancelRequest() {},
        async readRequest() {
          return undefined;
        },
      },
      f.snapshot(),
      1,
    );
    expect(result).toMatchObject({
      ready: false,
      activeRemaining: 1,
      unknownDispatches: 1,
    });
  } finally {
    f.cleanup();
  }
});
it("rejects mismatched observation identity and times out hung drain without opening admission", async () => {
  const f = await activeLegacy();
  try {
    await expect(
      drainLegacy(
        {
          ...f.port,
          async readRequest() {
            return archivedRequest();
          },
        },
        f.snapshot(),
        1,
      ),
    ).rejects.toThrow("MG05_OBSERVATION_BINDING");
    await expect(
      drainLegacy(
        {
          ...f.port,
          async reconcileOwnedCdp() {
            return new Promise<number>(() => {});
          },
        },
        f.snapshot(),
        1,
        10,
      ),
    ).rejects.toThrow("MG05_DRAIN_TIMEOUT");
  } finally {
    f.cleanup();
  }
});

it("an incomplete persisted request list cannot hide remaining live work or selection authority", async () => {
  const f = await activeLegacy();
  try {
    expect(await drainLegacy(f.port, {}, 1)).toMatchObject({
      ready: false,
      activeRemaining: 1,
    });
    expect(
      await drainLegacy(
        {
          ...f.port,
          async revokeSelections() {
            return 1;
          },
        },
        f.snapshot(),
        1,
      ),
    ).toMatchObject({ ready: false, remainingSelections: 1 });
  } finally {
    f.cleanup();
  }
});
it("an old UNKNOWN terminal summary remains a blocker without fresh reconciliation", async () => {
  const f = await activeLegacy();
  try {
    f.cleanup();
    const result = await drainLegacy(
      f.port,
      { execution_requests_v1: [archivedRequest({ outcome: "UNKNOWN" })] },
      1,
    );
    expect(result).toMatchObject({ ready: false, unknownDispatches: 1 });
  } finally {
    f.cleanup();
  }
});
