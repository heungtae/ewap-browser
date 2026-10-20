import { CdpAttachDenied } from "../../../../../packages/browser-runtime/src/index.js";
import { expect, it } from "vitest";
import { brokerFixture } from "./support.js";
it("S32 isolates AX/input capabilities and always detaches its owned session", async () => {
  const f = await brokerFixture();
  f.options.allowed = (cap) => cap === "ax";
  await f.broker.ax(f.context, f.signal);
  expect(f.calls).toEqual(["attach", "Accessibility.getFullAXTree", "detach"]);
  expect(f.markers.size).toBe(0);
  await expect(f.broker.capture(f.context, f.signal, () => {})).rejects.toThrow(
    "CDP_PERMISSION_DENIED",
  );
  f.context.mode = "ask";
  await expect(
    f.broker.insertText(f.context, f.signal, "x", () => {}),
  ).rejects.toThrow("CDP_INPUT_DENIED");
});
it("S32 never detaches another debugger and keeps DOM paths independent", async () => {
  const f = await brokerFixture();
  f.transport.attach = async () => {
    throw new CdpAttachDenied("ANOTHER_DEBUGGER");
  };
  await expect(f.broker.ax(f.context, f.signal)).rejects.toThrow(
    "ANOTHER_DEBUGGER",
  );
  expect(f.calls).not.toContain("detach");
  expect(f.markers.size).toBe(0);
});
it("S32 quarantine survives cleanup failure and prevents another attach", async () => {
  const f = await brokerFixture();
  f.transport.detach = async () => {
    throw new Error("DETACH_FAILED");
  };
  await f.broker.ax(f.context, f.signal);
  expect(f.broker.isQuarantined(1)).toBe(true);
  expect(f.markers.size).toBe(1);
  await expect(f.broker.ax(f.context, f.signal)).rejects.toThrow(
    "CDP_UNAVAILABLE",
  );
});
it("S32 abrupt detach and changed document reject late observations", async () => {
  for (const navigation of [true, false]) {
    const f = await brokerFixture();
    f.transport.send = async () => {
      if (navigation) f.context.documentEpoch++;
      else f.detach();
      return { nodes: [] };
    };
    await expect(
      f.broker.ax(structuredClone(f.context), f.signal),
    ).rejects.toThrow(navigation ? "CDP_BINDING_STALE" : "CDP_CLOSED");
    expect(f.markers.size).toBe(0);
  }
});
it("S32 persistent ownership marker blocks recovery before any command", async () => {
  const f = await brokerFixture();
  f.markers.set(1, "previous-runtime");
  await expect(f.broker.ax(f.context, f.signal)).rejects.toThrow(
    "CDP_RECOVERY_REQUIRED",
  );
  expect(f.calls).toEqual([]);
});

it("S32 an unknown attach acknowledgement preserves quarantine without touching other sessions", async () => {
  const f = await brokerFixture();
  f.transport.attach = async () => {
    throw new Error("ACK_UNKNOWN");
  };
  await expect(f.broker.ax(f.context, f.signal)).rejects.toThrow("ACK_UNKNOWN");
  expect(f.broker.isQuarantined(1)).toBe(true);
  expect(f.markers.size).toBe(1);
  expect(f.calls).not.toContain("detach");
});
