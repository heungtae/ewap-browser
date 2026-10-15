import { describe, expect, it } from "vitest";
import { dual, jev, primary, setup, task } from "./s25-support.js";
import { decodeProviderState } from "../../../src/settings/provider-state.js";
import { mergeWriteOnlyProvider } from "../../../src/settings/provider-secret-write.js";
import { parsePublicProviderImport } from "../../../src/settings/provider-public-import.js";

describe("S25 provider roles and migration", () => {
  it("migrates v1 without losing IDs, legacy identity, credentials or headers and starts single", async () => {
    const state = decodeProviderState({
      schema_version: 1,
      providers: { original: primary },
      active_provider: "original",
    });
    expect(state).toMatchObject({
      schema_version: 2,
      revision: 0,
      active_provider: "original",
      routing: { mode: "single" },
      providers: { original: { kind: "openai_compatible", config: primary } },
    });
  });
  it.each([
    "missing",
    "unselected",
    "endpoint",
    "model",
    "key",
    "invalid",
    "disabled",
    "null_config",
    "missing_config",
    "extra_record",
    "off",
  ])(
    "%s optional Jev preserves primary for both failure policies",
    async (scenario) => {
      for (const pre_dispatch_failure of ["primary", "stop"]) {
        const { runtime, state, replace } = setup();
        await dual(runtime, pre_dispatch_failure);
        const snapshot = decodeProviderState(state());
        if (scenario === "missing") delete snapshot.providers.decision;
        if (scenario === "unselected")
          delete snapshot.routing.decision_provider;
        if (scenario === "endpoint")
          snapshot.providers.decision!.config.base_url = "";
        if (scenario === "model")
          snapshot.providers.decision!.config.model = "";
        if (scenario === "key")
          snapshot.providers.decision!.config.api_key = "";
        if (scenario === "invalid")
          snapshot.providers.decision!.config.timeout_ms = -1;
        if (scenario === "disabled")
          snapshot.providers.decision!.config.enabled = false;
        if (scenario === "null_config")
          snapshot.providers.decision!.config = null as never;
        if (scenario === "missing_config")
          delete (snapshot.providers.decision as { config?: unknown }).config;
        if (scenario === "extra_record")
          Object.assign(snapshot.providers.decision!, {
            unexpected: "fixture-private-extra",
          });
        if (scenario === "off") snapshot.routing.mode = "single";
        replace(snapshot);
        expect((await runtime.handle("PROVIDER_LIST", undefined)).ok).toBe(
          true,
        );
        const binding = await runtime.bindings.get(
          new AbortController().signal,
        );
        expect(binding.primary.api_key).toBe(primary.api_key);
        expect(binding.decision).toBeUndefined();
        await expect(
          runtime.decide(task, { signal: new AbortController().signal }),
        ).resolves.toBeUndefined();
        expect(
          decodeProviderState(state()).providers.primary!.config.api_key,
        ).toBe(primary.api_key);
      }
    },
  );
  it("never inherits another kind or destination's secret", () => {
    expect(
      mergeWriteOnlyProvider(primary, { ...jev, api_key: "" }).api_key,
    ).toBe("");
    expect(mergeWriteOnlyProvider(jev, { ...jev, api_key: "" }).api_key).toBe(
      jev.api_key,
    );
    expect(
      mergeWriteOnlyProvider(jev, {
        ...jev,
        base_url: "https://other.example/v1",
        api_key: "",
      }).api_key,
    ).toBe("");
  });
  it("rejects decision-as-primary and dual referenced deletion; requires disable first", async () => {
    const { runtime } = setup();
    await dual(runtime);
    await expect(
      runtime.handle("PROVIDER_SET_ACTIVE", { id: "decision" }),
    ).rejects.toThrow("PROVIDER_NOT_CONFIGURED");
    await expect(
      runtime.handle("PROVIDER_REMOVE", {
        id: "decision",
        delete_secret: true,
      }),
    ).rejects.toThrow("INVALID_ARGUMENT");
    const { revision } = await runtime.handle("PROVIDER_LIST", undefined);
    await runtime.handle("PROVIDER_SET_ROUTING", {
      revision,
      routing: { mode: "single", pre_dispatch_failure: "primary" },
    });
    await expect(
      runtime.handle("PROVIDER_REMOVE", {
        id: "decision",
        delete_secret: true,
      }),
    ).resolves.toMatchObject({ ok: true });
  });
  it("serializes concurrent writes and rejects stale form edits", async () => {
    const { runtime } = setup();
    await Promise.all([
      runtime.handle("PROVIDER_SAVE", { id: "one", config: primary }),
      runtime.handle("PROVIDER_SAVE", { id: "two", config: primary }),
    ]);
    expect(
      Object.keys(
        (await runtime.handle("PROVIDER_LIST", undefined)).providers as object,
      ),
    ).toEqual(["one", "two"]);
    await expect(
      runtime.handle("PROVIDER_SAVE", {
        id: "one",
        config: primary,
        revision: 0,
      }),
    ).rejects.toThrow("INVALID_ARGUMENT");
  });
  it("exports secret-free v2 without routing activation and accepts legacy v1", async () => {
    const { runtime } = setup();
    await dual(runtime);
    const exported = (await runtime.handle("PROVIDER_EXPORT", undefined))
      .export as Record<string, unknown>;
    expect(exported.schema_version).toBe(2);
    expect(JSON.stringify(exported)).not.toMatch(
      /fixture-(primary|decision|header)-secret|routing/,
    );
    const single = {
      ...exported,
      providers: {
        decision: (exported.providers as Record<string, unknown>).decision,
      },
      active_provider: undefined,
    };
    expect(parsePublicProviderImport(single).config.kind).toBe("typesafe_jev");
    expect(
      parsePublicProviderImport({
        schema_version: 1,
        providers: {
          primary: {
            ...Object.fromEntries(
              Object.entries(primary).filter(
                ([key]) => !["api_key", "headers"].includes(key),
              ),
            ),
            has_api_key: true,
            header_names: ["x-fixture"],
          },
        },
      }),
    ).toBeDefined();
  });
});
