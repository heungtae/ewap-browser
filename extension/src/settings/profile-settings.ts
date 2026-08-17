import { fail, isPlainObject } from "../security/validation.js";

export type ProfileResolverSettingsState = {
  schema_version: 1;
  deployment_id: string;
  url: string;
  allowed_origins: string[];
  key_ring: Record<string, string>;
};
export type ProfileSettingsStorage = {
  read(): Promise<unknown>;
  write(value: ProfileResolverSettingsState): Promise<void>;
};

export const validateProfileResolverSettings = (
  value: unknown,
): ProfileResolverSettingsState => {
  if (
    !isPlainObject(value) ||
    value.schema_version !== 1 ||
    typeof value.deployment_id !== "string" ||
    !value.deployment_id ||
    typeof value.url !== "string" ||
    !value.url ||
    !Array.isArray(value.allowed_origins) ||
    !isPlainObject(value.key_ring) ||
    Object.keys(value).some(
      (key) =>
        ![
          "schema_version",
          "deployment_id",
          "url",
          "allowed_origins",
          "key_ring",
        ].includes(key),
    )
  )
    return fail("INVALID_ARGUMENT");
  let endpoint: URL;
  try {
    endpoint = new URL(value.url);
  } catch {
    return fail("INVALID_ARGUMENT");
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  )
    return fail("INVALID_ARGUMENT");
  const origins = value.allowed_origins.map((origin) => {
    try {
      const parsed = new URL(origin);
      if (
        parsed.protocol !== "https:" ||
        parsed.pathname !== "/" ||
        parsed.search ||
        parsed.hash
      )
        return fail("INVALID_ARGUMENT");
      return parsed.origin;
    } catch {
      return fail("INVALID_ARGUMENT");
    }
  });
  const keyRing: Record<string, string> = {};
  for (const [kid, pem] of Object.entries(value.key_ring)) {
    if (
      !/^[A-Za-z0-9._-]{1,64}$/.test(kid) ||
      typeof pem !== "string" ||
      !pem.includes("PUBLIC KEY")
    )
      return fail("INVALID_ARGUMENT");
    keyRing[kid] = pem;
  }
  if (origins.length === 0 || Object.keys(keyRing).length === 0)
    return fail("INVALID_ARGUMENT");
  return {
    schema_version: 1,
    deployment_id: value.deployment_id,
    url: endpoint.toString(),
    allowed_origins: origins,
    key_ring: keyRing,
  };
};

export class ProfileResolverSettings {
  public constructor(private readonly storage: ProfileSettingsStorage) {}
  public async save(value: unknown): Promise<void> {
    await this.storage.write(validateProfileResolverSettings(value));
  }
  public async read(): Promise<ProfileResolverSettingsState | undefined> {
    const value = await this.storage.read();
    return value === undefined
      ? undefined
      : validateProfileResolverSettings(value);
  }
}
