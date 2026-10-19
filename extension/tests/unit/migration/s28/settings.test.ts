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
