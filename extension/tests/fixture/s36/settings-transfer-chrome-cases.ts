import { ownerFixture } from "./installed-owner-chrome.js";
import { policyFixture } from "./installed-policy-chrome.js";
import "../../../../apps/chrome-extension/src/bridge/schema-config.js";
import { settingsTransport } from "../../../../apps/chrome-extension/src/migration/settings-rpc.js";
import { migrationTransport } from "../../../../apps/chrome-extension/src/migration/rpc.js";
import { migrationDigest } from "../../../../apps/chrome-extension/src/migration/migration-digest.js";
import type { MigrationCommand } from "../../../../packages/shared/src/migration-rpc.js";
import type { Checkpoint } from "../../../../packages/shared/src/migration-types.js";
const chrome = (
  globalThis as unknown as {
    chrome: {
      runtime: {
        sendMessage(value: unknown): Promise<{ ok: boolean; result: unknown }>;
      };
      storage: {
        session: {
          get(keys: string[]): Promise<Record<string, unknown>>;
          set(value: Record<string, unknown>): Promise<void>;
        };
        local: {
          get(keys: string[]): Promise<Record<string, unknown>>;
          set(value: Record<string, unknown>): Promise<void>;
        };
      };
    };
  }
).chrome;
let profile: string,
  frozen = true,
  digest: string,
  checkpoint: Checkpoint;
let secretRequests = 0;
let policyRequests = 0;
let storeMode: "session-only" | "os-store" = "session-only";
const source = {
  async get(keys: string[]) {
    return chrome.storage.local.get(keys);
  },
  async assertFrozen(epoch: number) {
    if (!frozen || epoch !== 1) throw new Error("SOURCE_NOT_FROZEN");
  },
};
async function request(command: MigrationCommand) {
  if (command.kind.startsWith("migration.settings.")) secretRequests++;
  if (command.kind.startsWith("migration.policy.")) policyRequests++;
  const result = await chrome.runtime.sendMessage(command);
  if (!result.ok) throw new Error("RPC_UNAVAILABLE");
  if (/PRIVATE_API_CANARY|PRIVATE_HEADER_CANARY/.test(JSON.stringify(result)))
    throw new Error("SECRET_RESPONSE");
  return result.result;
}
const policy = policyFixture(source, request, (value) =>
  chrome.storage.local.set(value),
);
const owner = ownerFixture(
  source,
  {
    assertFrozen: source.assertFrozen,
    get: (keys) => chrome.storage.session.get(keys),
  },
  (value) => chrome.storage.local.set(value),
  (value) => chrome.storage.session.set(value),
  request,
);
function client() {
  return settingsTransport(profile, source, request);
}
export async function prepare(
  profileGuard: string,
  mode: "session-only" | "os-store" = "session-only",
  joint = false,
  allUnits = false,
) {
  storeMode = mode;
  profile = profileGuard;
  await chrome.storage.local.set({
    provider_settings: {
      schema_version: 2,
      revision: 1,
      active_provider: "primary",
      routing: { mode: "single", pre_dispatch_failure: "primary" },
      providers: {
        primary: {
          kind: "openai_compatible",
          config: {
            plugin_id: "contextpilot.openai-compatible",
            plugin_version: "1.0.0",
            label: "Controlled provider",
            base_url: "https://provider.example.test/v1",
            model: "gpt-test",
            wire_api: "responses",
            api_key: "PRIVATE_API_CANARY_RPC",
            api_key_header: "authorization_bearer",
            headers: [
              { name: "x-private", value: "PRIVATE_HEADER_CANARY_RPC" },
            ],
            timeout_ms: 10000,
            enabled: true,
          },
        },
      },
    },
  });
  digest = migrationDigest(await source.get(["provider_settings"]));
  const policyDigest = joint ? await policy.prepare(profile) : undefined;
  return {
    digest,
    policyDigest,
    sourceDigests: allUnits ? await owner.prepare(profile) : undefined,
  };
}
export async function ready() {
  return migrationTransport(profile, request).status();
}
export async function stage() {
  const value = await client().stage("wire", 1, digest, storeMode);
  if (checkpoint && migrationDigest(value) !== migrationDigest(checkpoint))
    throw new Error("CHECKPOINT_CHANGED");
  checkpoint = value;
  await client().validate("wire", 1, checkpoint, storeMode);
  return { copied: value.copied, quarantined: value.quarantined };
}
export async function expectLostSession() {
  try {
    await client().validate("wire", 1, checkpoint, storeMode);
  } catch {
    return true;
  }
  throw new Error("SESSION_SECRET_UNEXPECTEDLY_RESTORED");
}
export async function revoked() {
  frozen = false;
  const count = secretRequests;
  try {
    await client().stage("wire", 1, digest, storeMode);
  } catch {
    if (secretRequests !== count) throw new Error("UNFROZEN_TRANSFER");
    return migrationDigest(await source.get(["provider_settings"])) === digest;
  }
  throw new Error("UNFROZEN_TRANSFER");
}

export async function validatePersisted() {
  await client().validate("wire", 1, checkpoint, storeMode);
  return true;
}

export const stagePolicy = () => policy.copy();
export const validatePolicy = () => policy.validate();
export async function rejectPolicyDriftAndEpoch() {
  const count = policyRequests;
  await policy.wrongEpoch();
  await policy.drift();
  if (count !== policyRequests) throw new Error("STALE_POLICY_FORWARDED");
  return policy.validate();
}

export const stageOwner = () => owner.copy(checkpoint);
export const reopenOwner = () => owner.reopen();
export const ownerNegatives = () => owner.negatives();
