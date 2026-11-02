import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { Handshake } from "../../../../../apps/agent-server/src/ipc/auth.js";
import { nativeHello } from "../../../../../apps/chrome-extension/src/bridge/native-auth.js";
it("authenticates an explicit read capability and rejects capability tampering without changing legacy proof", async () => {
  const pairing = {
    installationId: randomUUID(),
    profileId: randomUUID(),
    extensionId: "a".repeat(32),
    secret: "b".repeat(64),
  };
  const config = { ...pairing, extensionIds: [pairing.extensionId] };
  const legacy = new Handshake(config, Date.now() + 5000);
  expect(
    legacy.accept(await nativeHello(pairing, legacy.nonce), Date.now())
      .capabilities,
  ).toBeUndefined();
  const enabled = new Handshake(config, Date.now() + 5000);
  expect(
    enabled.accept(await nativeHello(pairing, enabled.nonce, true), Date.now())
      .capabilities,
  ).toEqual(["codebase.read"]);
  const changed = new Handshake(config, Date.now() + 5000);
  const original = await nativeHello(pairing, changed.nonce);
  expect(() =>
    changed.accept(
      { ...original, capabilities: ["codebase.read"] },
      Date.now(),
    ),
  ).toThrow("AUTH_DENIED");
});
