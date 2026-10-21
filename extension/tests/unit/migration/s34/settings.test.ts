import { expect, it } from "vitest";
import {
  migrateProviderRoles,
  credentialIdentity,
} from "../../../../../apps/agent-server/src/settings/role-migration.js";
import { AnalystSecrets } from "../../../../../apps/agent-server/src/settings/analyst-secrets.js";
import { SessionSecrets } from "../../../../../apps/agent-server/src/settings/service.js";
const primary = {
  base_url: "https://analyst.fixture.test/v1",
  model: "gpt-fixture",
  wire_api: "responses",
  enabled: true,
  api_key_header: "authorization_bearer",
  api_key: "fixture-private-key",
};
it("S34 v1 selected primary becomes a disabled analyst candidate; archive is preserved", () => {
  const source = {
    schema_version: 1,
    providers: { primary },
    active_provider: "primary",
  };
  const roles = migrateProviderRoles(source);
  expect(roles.candidates).toMatchObject([
    { role: "analyst", enabled: false, ready: false },
  ]);
  expect(JSON.stringify(roles.candidates)).not.toContain(primary.api_key);
  expect(roles.archive).toEqual(source);
  expect(roles.controllerFailure).toBe("stop");
});
it("S34 v2 JEV selection never auto-enables or grants analyst fallback", () => {
  const source = {
    schema_version: 2,
    providers: {
      primary: { kind: "openai_compatible", config: primary },
      jev: {
        kind: "typesafe_jev",
        config: { ...primary, model: "jev-1.13.0" },
      },
    },
    active_provider: "primary",
    routing: { decision_provider: "jev", pre_dispatch_failure: "primary" },
  };
  const roles = migrateProviderRoles(source);
  expect(roles.candidates.map((c) => c.role)).toEqual([
    "analyst",
    "controller",
  ]);
  expect(roles.candidates.every((c) => !c.enabled && !c.ready)).toBe(true);
  expect(roles.controllerFailure).toBe("stop");
});
it.each(["disabled", "invalid", "non-gpt", "chat", "insecure"])(
  "S34 retains %s providers for repair without creating readiness",
  (kind) => {
    const config =
      kind === "invalid"
        ? null
        : {
            ...primary,
            ...(kind === "disabled" ? { enabled: false } : {}),
            ...(kind === "non-gpt" ? { model: "non-gpt" } : {}),
            ...(kind === "chat" ? { wire_api: "chat_completions" } : {}),
            ...(kind === "insecure" ? { base_url: "http://unsafe.test" } : {}),
          };
    const source = {
      schema_version: 1,
      providers: { primary: config },
      active_provider: "primary",
    };
    const roles = migrateProviderRoles(source);
    expect(roles.candidates).toHaveLength(0);
    expect(roles.repair).toHaveLength(1);
    expect(roles.archive).toEqual(source);
  },
);
it("S34 blank writes preserve secrets only within the exact credential boundary", async () => {
  const store = new AnalystSecrets(new SessionSecrets());
  const binding = {
    providerId: "primary",
    endpoint: "https://analyst.fixture.test/v1",
    kind: "analyst" as const,
    auth: "bearer",
    credentialBoundary: "user-one",
  };
  const id = credentialIdentity(binding);
  await store.write(id, "fixture-private-key");
  await store.write(id, " ");
  expect(await store.read(id)).toBe("fixture-private-key");
  for (const changed of [
    { endpoint: "https://other.test/v1" },
    { kind: "controller" as const },
    { auth: "api-key" },
    { credentialBoundary: "user-two" },
    { providerId: "other" },
  ]) {
    const other = credentialIdentity({ ...binding, ...changed });
    await store.write(other, "");
    expect(await store.read(other)).toBeUndefined();
  }
});
