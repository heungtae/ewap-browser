import { migrationDigest } from "../../../dist/s36/transport.mjs";
export const rawCommand = (f, overrides = {}) => ({
  kind: "migration.settings.stage",
  profileGuard: f.profile,
  migrationId: "wire",
  epoch: 1,
  sourceDigest: migrationDigest({
    provider_settings: f.data.provider_settings,
  }),
  secretMode: "session-only",
  source: f.data.provider_settings,
  ...overrides,
});
