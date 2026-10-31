import { expect, it } from "vitest";
import {
  SessionSecrets,
  SettingsService,
} from "../../../../../apps/agent-server/src/settings/service.js";
import { BridgeClient } from "../../../../../apps/chrome-extension/src/bridge/client.js";
it("keeps secrets session-only and blank writes confined to identity", async () => {
  const secrets = new SessionSecrets();
  const settings = new SettingsService(secrets);
  const id = JSON.stringify({
    id: "p",
    providerKind: "jev",
    credentialBoundary: "token-auth",
    endpoint: "https://one.test",
  });
  const other = JSON.stringify({
    id: "p",
    providerKind: "jev",
    credentialBoundary: "token-auth",
    endpoint: "https://two.test",
  });
  await settings.writeSecret(id, "sensitive-value");
  await settings.writeSecret(id, " ");
  await settings.writeSecret(other, "");
  expect(await secrets.read(id)).toBe("sensitive-value");
  expect(await secrets.read(other)).toBeUndefined();
  expect(JSON.stringify(settings.publicSettings())).not.toContain(
    "sensitive-value",
  );
  expect(settings.publicSettings().secretMode).toBe("session-only");
  secrets.clear();
  expect(await secrets.read(id)).toBeUndefined();
});
it("deduplicates replayed events and exposes disconnect instead of success", async () => {
  const rendered: number[] = [];
  const statuses: string[] = [];
  const client = new BridgeClient(
    {
      request: async () => ({
        events: [{ sequence: 1, revision: 1, kind: "waiting" }],
        cursor: 1,
        resync: false,
      }),
    },
    (e) => rendered.push(e.sequence),
    (s) => statuses.push(s),
  );
  await client.resume();
  await client.resume();
  expect(rendered).toEqual([1]);
  client.disconnect();
  expect(client.available()).toBe(false);
  expect(statuses[0]).toContain("waiting");
});
it("does not skip unapplied snapshots or restore availability on later replay", async () => {
  const requested: number[] = [];
  const rendered: number[] = [];
  let resync = true;
  const client = new BridgeClient(
    {
      request: async (_kind, after) => {
        requested.push(after);
        return resync
          ? {
              events: [],
              cursor: 10,
              resync: true,
              snapshot: { revision: 10, state: "waiting" },
            }
          : {
              events: [{ sequence: 1, revision: 1, kind: "waiting" }],
              cursor: 1,
              resync: false,
            };
      },
    },
    (event) => rendered.push(event.sequence),
    () => {},
  );
  await client.resume();
  resync = false;
  await client.resume();
  expect(requested).toEqual([0, 0]);
  expect(rendered).toEqual([]);
  expect(client.available()).toBe(false);
});
it("rejects a gapped replay before rendering any partial batch", async () => {
  const rendered: number[] = [];
  const client = new BridgeClient(
    {
      request: async () => ({
        events: [
          { sequence: 1, revision: 1, kind: "message" },
          { sequence: 3, revision: 3, kind: "message" },
        ],
        cursor: 3,
        resync: false,
      }),
    },
    (event) => rendered.push(event.sequence),
    () => {},
  );
  await expect(client.resume()).rejects.toThrow("EVENT_GAP");
  expect(rendered).toEqual([]);
  expect(client.available()).toBe(false);
});
it("rejects an incorrect replay cursor and clears availability on transport failure", async () => {
  let failure = false;
  let mismatch = false;
  const client = new BridgeClient(
    {
      request: async () => {
        if (failure) throw new Error("DISCONNECTED");
        return { events: [], cursor: mismatch ? 1 : 0, resync: false };
      },
    },
    () => {},
    () => {},
  );
  await client.resume();
  expect(client.available()).toBe(true);
  failure = true;
  await expect(client.resume()).rejects.toThrow("DISCONNECTED");
  expect(client.available()).toBe(false);
  failure = false;
  mismatch = true;
  await expect(client.resume()).rejects.toThrow("EVENT_GAP");
  expect(client.available()).toBe(false);
});
