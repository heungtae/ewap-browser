import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { capabilityHealth } from "../../../../../apps/agent-server/src/settings/health.js";
import { ConnectionTransfers } from "../../../../../apps/agent-server/src/ipc/transfers.js";
import {
  Session,
  digest,
} from "../../../../../apps/agent-server/src/ipc/session.js";
it("does not accept a stale browser generation after disconnect", () => {
  const session = new Session(
    {
      installationId: "install",
      profileId: "profile",
      extensionIds: ["a".repeat(32)],
      secret: "f".repeat(64),
    },
    1,
  );
  const send = (id: string, payload: unknown) =>
    session.accept(
      {
        major: 1,
        minor: 0,
        messageId: id,
        connectionId: session.connectionId,
        connectionEpoch: 1,
        installationId: "install",
        profileId: "profile",
        sender: "extension",
        sentAt: 1,
        deadline: 100,
        payloadDigest: digest(payload),
        payload,
      },
      2,
    );
  send("first", { kind: "browser.connected", generation: 2 });
  send("disconnect", { kind: "browser.disconnected" });
  expect(session.browserAvailable()).toBe(false);
  expect(() =>
    send("stale", { kind: "browser.connected", generation: 2 }),
  ).toThrow("STALE_BROWSER");
  expect(() =>
    send("older", { kind: "browser.connected", generation: 1 }),
  ).toThrow("STALE_BROWSER");
  expect(session.browserAvailable()).toBe(false);
  send("fresh", { kind: "browser.connected", generation: 3 });
  expect(session.browserAvailable()).toBe(true);
});
const ready = {
  hostInstalled: true,
  executableValid: true,
  protocolMajor: 1,
  paired: true,
  durableSecrets: true,
};
it.each([
  [{ hostInstalled: false }, "MISSING_HOST"],
  [{ executableValid: false }, "INVALID_EXECUTABLE"],
  [{ protocolMajor: 2 }, "INCOMPATIBLE_VERSION"],
  [{ paired: false }, "UNPAIRED"],
  [{ durableSecrets: false }, "SESSION_ONLY"],
  [{}, "BRIDGE_READY"],
])(
  "reports setup state without claiming task authority: %j",
  (patch, expected) => {
    expect(capabilityHealth({ ...ready, ...patch })).toEqual({
      state: expected,
      taskReady: false,
      browserDispatchReady: false,
    });
  },
);
it("bounds active transfers, rejects unknown state and permanently retires canceled IDs", () => {
  const t = new ConnectionTransfers();
  const open = {
    kind: "transfer.open",
    id: "one",
    count: 1,
    bytes: 1,
    deadline: 1000,
    digest: "a".repeat(64),
  };
  expect(() =>
    t.handle(
      { kind: "transfer.chunk", id: "one", index: 0, base64: "YQ==" },
      0,
    ),
  ).toThrow();
  t.handle(open, 0);
  expect(() => t.handle({ ...open, id: "two" }, 1)).toThrow();
  t.handle({ kind: "transfer.cancel", id: "one" }, 1);
  expect(() => t.handle(open, 2)).toThrow();
});
it("expires stalled transfers without accepting late chunks or reusing the ID", () => {
  vi.useFakeTimers();
  try {
    const t = new ConnectionTransfers();
    const open = {
      kind: "transfer.open",
      id: "stalled",
      count: 1,
      bytes: 1,
      deadline: 100,
      digest: createHash("sha256").update("a").digest("hex"),
    };
    t.handle(open, 0);
    t.handle(
      { kind: "transfer.chunk", id: open.id, index: 0, base64: "YQ==" },
      1,
    );
    vi.advanceTimersByTime(100);
    expect(() =>
      t.handle({ kind: "transfer.ack", id: open.id, index: 0 }, 100),
    ).toThrow("TRANSFER_UNKNOWN");
    expect(() =>
      t.handle({ kind: "transfer.complete", id: open.id }, 100),
    ).toThrow("TRANSFER_UNKNOWN");
    expect(() => t.handle({ ...open, deadline: 200 }, 100)).toThrow(
      "TRANSFER_ORDER",
    );
  } finally {
    vi.useRealTimers();
  }
});
it("discards partial data on connection cancellation and allows only verified complete transfers", () => {
  const t = new ConnectionTransfers();
  const open = {
    kind: "transfer.open",
    id: "partial",
    count: 1,
    bytes: 1,
    deadline: 1000,
    digest: createHash("sha256").update("a").digest("hex"),
  };
  t.handle(open, 0);
  t.handle(
    { kind: "transfer.chunk", id: open.id, index: 0, base64: "YQ==" },
    1,
  );
  t.cancel();
  expect(() => t.handle({ kind: "transfer.complete", id: open.id }, 2)).toThrow(
    "TRANSFER_UNKNOWN",
  );
  const next = { ...open, id: "complete" };
  t.handle(next, 2);
  t.handle(
    { kind: "transfer.chunk", id: next.id, index: 0, base64: "YQ==" },
    3,
  );
  t.handle({ kind: "transfer.ack", id: next.id, index: 0 }, 4);
  expect(t.handle({ kind: "transfer.complete", id: next.id }, 5)).toEqual({
    state: "verified",
    bytes: 1,
  });
  expect(() => t.handle(next, 6)).toThrow("TRANSFER_ORDER");
});
