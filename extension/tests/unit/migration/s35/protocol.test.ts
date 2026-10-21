import { expect, it, vi } from "vitest";
import {
  Frames,
  frame,
  proof,
} from "../../../../../packages/integration-adapters/src/ipc.js";
import {
  IntegrationAdapters,
  protocols,
} from "../../../../../packages/integration-adapters/src/compatibility.js";
it("S35 length-prefixed IPC handles split frames and rejects oversized payloads", () => {
  const parser = new Frames(),
    payload = frame({ ready: true });
  expect(parser.push(payload.subarray(0, 3))).toEqual([]);
  expect(parser.push(payload.subarray(3))).toEqual([{ ready: true }]);
  const oversized = Buffer.alloc(4);
  oversized.writeUInt32LE(262145);
  expect(() => parser.push(oversized)).toThrow("MCP_FRAME_LIMIT");
  expect(() => frame("x".repeat(262144))).toThrow("MCP_FRAME_LIMIT");
});
it("S35 HMAC binds protocol, client and fresh server nonce", () => {
  const secret = "fixture-only-secret";
  const first = proof(secret, "client", "nonce-one");
  expect(proof(secret, "client", "nonce-two")).not.toBe(first);
  expect(proof(secret, "other", "nonce-one")).not.toBe(first);
});
it("S35 adapters preserve named original envelopes and reject unsupported/missing protocols", async () => {
  const port = vi.fn().mockImplementation(async (original) => original);
  const adapters = new IntegrationAdapters({ business: port });
  const original = {
    kind: "CALL_PAGE_BUSINESS_TOOL",
    arguments: { query: "safe" },
  };
  expect(
    await adapters.invoke("business", protocols.business, original),
  ).toEqual({ protocol: protocols.business, original });
  await expect(
    adapters.invoke("business", "mcp-standard", original),
  ).rejects.toThrow("INTEGRATION_PROTOCOL_INCOMPATIBLE");
  await expect(adapters.invoke("pdp", protocols.pdp, original)).rejects.toThrow(
    "INTEGRATION_ADAPTER_UNAVAILABLE",
  );
  expect(port).toHaveBeenCalledTimes(1);
  expect(
    adapters.inventory().every((i) => i.platformConformance === "UNVERIFIED"),
  ).toBe(true);
});
