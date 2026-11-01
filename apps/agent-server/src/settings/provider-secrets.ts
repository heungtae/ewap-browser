import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { SecretStore } from "./service.js";
import type { ProviderWrite } from "../../../../packages/shared/src/settings-rpc.js";
import type { SettingsState } from "./provider-state.js";
export const secretSchema = z.strictObject({
  boundary: z.string().regex(/^[a-f0-9]{64}$/),
  apiKey: z.string().max(4096),
  headers: z.record(z.string(), z.string().max(4096)),
});
type RecordValue = SettingsState["providers"][string];
function boundary(
  state: SettingsState,
  id: string,
  record: Pick<ProviderWrite, "kind" | "base_url" | "api_key_header">,
) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        state.installationId,
        state.profileId,
        id,
        record.kind,
        record.base_url,
        record.api_key_header,
      ]),
    )
    .digest("hex");
}
export async function readMaterial(
  store: SecretStore,
  state: SettingsState,
  id: string,
  record: RecordValue,
) {
  const raw = await store.read(record.credentialRef);
  if (!raw) return { apiKey: "", headers: {} as Record<string, string> };
  const material = secretSchema.parse(JSON.parse(raw));
  if (material.boundary !== boundary(state, id, record))
    throw Error("SETTINGS_INVALID");
  return material;
}
export async function stageMaterial(
  store: SecretStore,
  state: SettingsState,
  id: string,
  input: ProviderWrite,
) {
  const previous = state.providers[id];
  const same =
    previous?.kind === input.kind &&
    previous.base_url === input.base_url &&
    previous.api_key_header === input.api_key_header;
  const old = same
    ? await readMaterial(store, state, id, previous)
    : { apiKey: "", headers: {} };
  const material = {
    boundary: boundary(state, id, input),
    apiKey:
      input.api_key_header === "none"
        ? ""
        : input.api_key.trim()
          ? input.api_key
          : old.apiKey,
    headers: Object.fromEntries(
      input.headers.map((h) => [
        h.name,
        h.value.trim() ? h.value : (old.headers[h.name] ?? ""),
      ]),
    ),
  };
  const encoded = JSON.stringify(material);
  if (Buffer.byteLength(encoded) > 65536) throw Error("SETTINGS_INVALID");
  const credentialRef = `settings:${state.installationId}:${state.profileId}:${id}:${randomUUID()}`;
  await store.write(credentialRef, encoded);
  return credentialRef;
}
export function publicRecord(record: RecordValue, hasKey: boolean) {
  const { credentialRef: _ref, ...publicValue } = record;
  return { ...publicValue, has_api_key: hasKey };
}

export async function assertPublicMetadata(
  state: SettingsState,
  store: SecretStore,
) {
  const fields = Object.entries(state.providers).flatMap(([id, record]) => [
    id,
    ...Object.values(publicRecord(record, false)).flatMap((value) =>
      typeof value === "string" ? [value] : Array.isArray(value) ? value : [],
    ),
  ]);
  for (const [id, record] of Object.entries(state.providers)) {
    const material = await readMaterial(store, state, id, record);
    if (
      [material.apiKey, ...Object.values(material.headers)].some(
        (secret) => secret && fields.some((field) => field.includes(secret)),
      )
    )
      throw Error("SETTINGS_INVALID");
  }
}
