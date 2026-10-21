import type { SecretStore } from "./service.js";
export class AnalystSecrets {
  constructor(private store: SecretStore) {}
  async write(identity: string, value: string): Promise<void> {
    if (
      !/^[a-f0-9]{64}$/.test(identity) ||
      value.length > 65536 ||
      /[\r\n]/.test(value)
    )
      throw new Error("PROVIDER_SECRET_INVALID");
    if (value.trim()) await this.store.write(identity, value);
  }
  async read(identity: string): Promise<string | undefined> {
    if (!/^[a-f0-9]{64}$/.test(identity)) throw new Error("PROVIDER_IDENTITY");
    return this.store.read(identity);
  }
}
