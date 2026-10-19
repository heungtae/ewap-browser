import { expect, it } from "vitest";
import { capabilityHealth } from "../../../../../apps/agent-server/src/settings/health.js";
import { ConnectionTransfers } from "../../../../../apps/agent-server/src/ipc/transfers.js";
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
