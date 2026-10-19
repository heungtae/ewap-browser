import { z } from "zod";
import type { PublicSettings } from "@contextpilot/shared/bridge";
const identitySchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/),
  endpoint: z.string().url().max(2048),
  providerKind: z.enum(["openai-compatible", "jev"]),
  credentialBoundary: z.string().min(1).max(128),
});
export interface SecretStore {
  readonly mode: "session-only" | "os-store";
  read(identity: string): Promise<string | undefined>;
  write(identity: string, value: string): Promise<void>;
}
export class SessionSecrets implements SecretStore {
  readonly mode = "session-only" as const;
  private values = new Map<string, string>();
  async read(identity: string) {
    return this.values.get(identity);
  }
  async write(identity: string, value: string) {
    if (
      value.length > 65536 ||
      (!this.values.has(identity) && this.values.size >= 64)
    )
      throw new Error("SECRET_LIMIT");
    this.values.set(identity, value);
  }
  clear() {
    this.values.clear();
  }
}
export class SettingsService {
  constructor(private secrets: SecretStore) {}
  async writeSecret(identity: string, value: string): Promise<void> {
    // A provider identity includes endpoint, provider ID and credential boundary.
    const parsed = identitySchema.parse(JSON.parse(identity));
    const endpoint = new URL(parsed.endpoint);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.username ||
      endpoint.password ||
      endpoint.hash
    )
      throw new Error("PROVIDER_IDENTITY");
    if (value.trim()) await this.secrets.write(identity, value);
  }
  publicSettings(): PublicSettings {
    return {
      controllerReady: false,
      analystReady: false,
      secretMode: this.secrets.mode,
    };
  }
}
