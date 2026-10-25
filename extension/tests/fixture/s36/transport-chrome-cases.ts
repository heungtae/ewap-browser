import "../../../../apps/chrome-extension/src/bridge/schema-config.js";
import { openDatabase } from "../../../../packages/codebase-repository/src/database.js";
import { Mg02Staging } from "../../../../apps/chrome-extension/src/migration/mg02-staging.js";
import { migrationTransport } from "../../../../apps/chrome-extension/src/migration/rpc.js";
import { policySource } from "../../unit/migration/s36/mg02-support.js";
import type { MigrationCommand } from "../../../../packages/shared/src/migration-rpc.js";
const sourceData = policySource();
const source = {
  async get() {
    return structuredClone(sourceData);
  },
  async assertFrozen(epoch: number) {
    if (epoch !== 1) throw new Error("SOURCE_NOT_FROZEN");
  },
};
let db: IDBDatabase, stage: Mg02Staging, profile: string;
async function request(command: MigrationCommand) {
  const chrome = (
    globalThis as unknown as {
      chrome: {
        runtime: {
          sendMessage(
            value: unknown,
          ): Promise<{ ok: boolean; result: unknown }>;
        };
      };
    }
  ).chrome;
  const value = await chrome.runtime.sendMessage(command);
  if (!value.ok) throw new Error("RPC_UNAVAILABLE");
  return value.result;
}
function client() {
  return migrationTransport(profile, request);
}
export async function prepare(profileGuard: string) {
  profile = profileGuard;
  db = await openDatabase(indexedDB, profile);
  stage = new Mg02Staging(db, source);
  const digest = await stage.sourceDigest(1);
  await stage.stage("wire", 1, digest);
  return { digest };
}
export async function mirror() {
  await stage.mirror("wire", 1, profile, client().port);
  if (!(await stage.validateMirror("wire", 1, profile, client().port)))
    throw new Error("MIRROR_INVALID");
  const status = await client().status();
  if (
    status.admission ||
    status.epoch !== 1 ||
    status.migration?.migrationId !== "wire"
  )
    throw new Error("STATUS_INVALID");
  return { mirror: true, admission: status.admission, epoch: status.epoch };
}
export async function readback() {
  return stage.validateMirror("wire", 1, profile, client().port);
}
export async function reopen() {
  db.close();
  db = await openDatabase(indexedDB, profile);
  stage = new Mg02Staging(db, source);
  return readback();
}
export async function negatives() {
  const chrome = (
    globalThis as unknown as {
      chrome: {
        runtime: { sendMessage(value: unknown): Promise<{ ok: boolean }> };
      };
    }
  ).chrome;
  for (const command of [
    { kind: "migration.status", profileGuard: "0".repeat(64) },
    { kind: "migration.commit", profileGuard: profile },
    {
      kind: "migration.policy.put",
      profileGuard: profile,
      value: { rawPage: "PRIVATE_PAGE_CANARY" },
    },
  ]) {
    if ((await chrome.runtime.sendMessage(command)).ok)
      throw new Error("RPC_NEGATIVE_ACCEPTED");
  }
  return true;
}

export async function ready() {
  return client().status();
}
