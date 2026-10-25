import { describe, expect, it } from "vitest";
import {
  releaseFileSchema,
  releaseSetSchema,
} from "../../../../../packages/shared/src/release-set.js";
const file = {
  path: "agent-server/launcher.cjs",
  bytes: 10,
  sha256: "a".repeat(64),
};
const manifest = {
  schema: "wca.release-set/v1",
  scope: "qualification-only",
  source: { revision: "b".repeat(40), dirty: true },
  platform: "linux",
  architecture: "x64",
  nodeVersion: "22.23.2",
  nodeMajor: 22,
  credentials: "session-only",
  versions: { extension: "0.1.117", backend: "0.0.0", browserApp: "0.0.0" },
  protocol: { major: 1, minor: 0 },
  files: [
    file,
    { ...file, path: "chrome-extension/manifest.json" },
    { ...file, path: "dependencies/pnpm-lock.yaml" },
  ],
};
describe("bounded release artifact contract", () => {
  it("rejects paths outside fixed component roots", () => {
    for (const path of [
      "../launcher.cjs",
      "agent-server/../key",
      "agent-server//file",
      "/agent-server/file",
      "agent-server/./file",
      "agent-server/a\\b",
    ])
      expect(releaseFileSchema.safeParse({ ...file, path }).success).toBe(
        false,
      );
  });
  it("rejects oversized artifacts and noncanonical digest values", () => {
    for (const patch of [
      { bytes: 64 * 1024 * 1024 + 1 },
      { bytes: -1 },
      { bytes: 1.5 },
      { sha256: "A".repeat(64) },
    ])
      expect(releaseFileSchema.safeParse({ ...file, ...patch }).success).toBe(
        false,
      );
  });
  it("requires all components with unique artifact names", () => {
    expect(releaseSetSchema.safeParse(manifest).success).toBe(true);
    expect(
      releaseSetSchema.safeParse({ ...manifest, files: [file, file, file] })
        .success,
    ).toBe(false);
    expect(
      releaseSetSchema.safeParse({
        ...manifest,
        files: [...manifest.files, file],
      }).success,
    ).toBe(false);
  });
  it("cannot promote qualification scope or claim an unsupported credential/OS mode", () => {
    for (const patch of [
      { scope: "production" },
      { credentials: "os-store" },
      { platform: "win32" },
      { releaseReady: true },
    ])
      expect(
        releaseSetSchema.safeParse({ ...manifest, ...patch }).success,
      ).toBe(false);
  });
});
