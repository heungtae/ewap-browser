import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { afterEach } from "vitest";
import { ProviderSettingsService } from "../../../../../apps/agent-server/src/settings/provider-service.js";
import { FileSettingsPersistence } from "../../../../../apps/agent-server/src/settings/provider-file.js";
import { SessionSecrets } from "../../../../../apps/agent-server/src/settings/service.js";
import type { ProviderWrite } from "../../../../../packages/shared/src/settings-rpc.js";
const directories: string[] = [];
afterEach(async () => {
  for (const path of directories.splice(0))
    await rm(path, { recursive: true, force: true });
});
export const scope = {
  installationId: "11111111-1111-4111-8111-111111111111",
  profileId: "22222222-2222-4222-8222-222222222222",
};
export const provider = (
  patch: Partial<ProviderWrite> = {},
): ProviderWrite => ({
  kind: "openai_compatible",
  plugin_id: "contextpilot.openai-compatible",
  plugin_version: "1.0.0",
  label: "Analyst",
  base_url: "https://provider.test/v1",
  model: "gpt-fixture",
  wire_api: "responses",
  api_key_header: "authorization_bearer",
  api_key: "SYNTHETIC_PROVIDER_KEY_123",
  headers: [{ name: "X-Fixture", value: "SYNTHETIC_HEADER_456" }],
  timeout_ms: 120000,
  enabled: true,
  private_network_opt_in: false,
  ...patch,
});
export async function fixture() {
  const directory = await mkdtemp(`${tmpdir()}/s28-settings-`);
  directories.push(directory);
  const path = `${directory}/public.json`;
  const store = new FileSettingsPersistence(path, scope);
  const secrets = new SessionSecrets(128);
  return {
    path,
    directory,
    store,
    secrets,
    service: new ProviderSettingsService(store, secrets),
  };
}
