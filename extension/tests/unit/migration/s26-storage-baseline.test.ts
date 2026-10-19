import { describe, expect, it } from "vitest";
import { decodeProviderState } from "../../../src/settings/provider-state.js";
import { readLearnedCatalog } from "../../../src/learned-profile/catalog-codec.js";
import { primary } from "../providers/s25-support.js";

describe("S26-R04 source-record characterization", () => {
  it("preserves provider counts and disabled flags through v1/v2 decoding", () => {
    const v1 = {
      schema_version: 1,
      active_provider: "enabled",
      providers: { enabled: primary, disabled: { ...primary, enabled: false } },
    };
    const upgraded = decodeProviderState(v1);
    expect(Object.keys(upgraded.providers)).toEqual(["enabled", "disabled"]);
    expect(upgraded.providers.disabled?.config.enabled).toBe(false);
    expect(decodeProviderState(upgraded)).toEqual(upgraded);
    expect(v1.schema_version).toBe(1);
  });
  it("rejects malformed settings without treating them as empty state", () => {
    for (const value of [
      false,
      [],
      { schema_version: 3 },
      { schema_version: 2, providers: {} },
    ])
      expect(() => decodeProviderState(value)).toThrow();
  });
  it("characterizes disabled recipe catalogs and malformed-record quarantine", () => {
    const source = {
      schema_version: 1,
      catalog_revision: 7,
      enabled: false,
      records: [{ invalid: true }],
      receipts: [],
    };
    const decoded = readLearnedCatalog(source);
    expect(decoded.enabled).toBe(false);
    expect(decoded.catalog_revision).toBe(7);
    expect(decoded.records).toHaveLength(0);
    expect(source.records).toHaveLength(1);
    expect(() => readLearnedCatalog({ schema_version: 2 })).toThrow();
  });
});
