import { observeMigrationOwner } from "../../../../apps/chrome-extension/src/migration/observed-owner.js";
import { consensusTransport } from "../../../../apps/chrome-extension/src/migration/consensus-rpc.js";
import type { BrowserMigrationPort } from "../../../../packages/shared/src/migration-ports.js";
import type { MigrationCommand } from "../../../../packages/shared/src/migration-rpc.js";
import type { FrozenSource } from "../../../../apps/chrome-extension/src/migration/local-staging.js";
import { chrome } from "./settings-chrome-api.js";
import type { policyFixture } from "./installed-policy-chrome.js";
export async function createObserved(
  profile: string,
  request: (command: MigrationCommand) => Promise<unknown>,
  browser: BrowserMigrationPort,
  source: FrozenSource,
  mode: "session-only" | "os-store",
) {
  const session = {
    assertFrozen: source.assertFrozen,
    get: (keys: string[]) => chrome.storage.session.get(keys),
  };
  const watched = await observeMigrationOwner(
    browser,
    source,
    session,
    chrome.storage.onChanged,
    1,
  );
  let requests = 0;
  const client = consensusTransport(
    profile,
    async (command) => {
      if (command.kind.startsWith("migration.consensus.")) requests++;
      return request(command);
    },
    watched.owner,
    watched.local,
    mode,
  );
  return { ...watched, client, count: () => requests };
}
export async function checkPolicyDrift(
  policy: ReturnType<typeof policyFixture>,
  count: () => number,
) {
  const before = count();
  await policy.wrongEpoch();
  await policy.drift();
  if (before !== count()) throw new Error("STALE_POLICY_FORWARDED");
  return policy.validate();
}
