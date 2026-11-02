import { digest, managementCommandSchema } from "@contextpilot/codebase-schema";
import {
  openDatabase,
  AdvisoryManager,
} from "@contextpilot/codebase-repository";
import { api } from "./api.js";
import { pairedCodebaseProfile } from "../codebase/profile-scope.js";
let active: { profile: string; db: Promise<IDBDatabase> } | undefined;
async function profileIdentity() {
  if (!api) throw Error("MANAGEMENT_PROFILE");
  const raw = (await api.storage.session.get("s28Pairing")).s28Pairing;
  if (!raw || typeof raw !== "object") throw Error("MANAGEMENT_PROFILE");
  const value = raw as Record<string, unknown>;
  if (
    typeof value.installationId !== "string" ||
    typeof value.profileId !== "string"
  )
    throw Error("MANAGEMENT_PROFILE");
  return pairedCodebaseProfile(value.installationId, value.profileId);
}
export async function managementRequest(raw: unknown) {
  const command = managementCommandSchema.parse(raw);
  const profile = await profileIdentity();
  const guard = await digest(profile);
  if (!active || active.profile !== profile) {
    if (active) void active.db.then((db) => db.close()).catch(() => undefined);
    active = { profile, db: openDatabase(indexedDB, guard) };
  }
  const result = await new AdvisoryManager(await active.db, guard).request(
    command,
  );
  if ((await profileIdentity()) !== profile) throw Error("MANAGEMENT_PROFILE");
  return result;
}
