import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("MV3 source smoke", () =>
  it("given_manifest_when_read_then_declares_side_panel_worker_and_content_script", async () => {
    const manifest = JSON.parse(
      await readFile("extension/manifest.json", "utf8"),
    );
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background.service_worker).toBeTruthy();
    expect(manifest.content_scripts).toHaveLength(1);
    expect(manifest.storage?.managed_schema).toBe(
      "managed-storage-schema.json",
    );
    const schema = JSON.parse(
      await readFile("extension/managed-storage-schema.json", "utf8"),
    );
    expect(Object.keys(schema.properties).sort()).toEqual([
      "enterprise_identity",
      "enterprise_policy",
      "runtime_evidence",
    ]);
  }));
