import { expect, it } from "vitest";
import {
  convertMg06,
  diagnosticsTtl,
} from "../../../../../apps/chrome-extension/src/migration/mg06-convert.js";
import {
  diagnosticsNow,
  diagnosticsSource,
  diagnosticRecord,
} from "./mg06-support.js";
it("projects safe status/correlation metadata without raw messages, identities or diagnostics configuration", () => {
  const source = diagnosticsSource();
  const original = structuredClone(source);
  const converted = convertMg06(source, diagnosticsNow);
  expect(converted.records[0]).toMatchObject({
    component: "act",
    outcome: "UNKNOWN",
    requestDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    workerDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
    expiresAt: diagnosticsNow - 1000 + diagnosticsTtl,
  });
  expect(JSON.stringify(converted)).not.toMatch(
    /CANARY|PRIVATE|message|debug_until_ms|dropped_count/,
  );
  expect(source).toEqual(original);
});
it("accounts for expired, future, duplicate and malformed records without silently dropping them", () => {
  const source = diagnosticsSource();
  source.execution_diagnostics_v1.records = [
    diagnosticRecord(),
    diagnosticRecord({
      sequence: 2,
      timestamp_ms: diagnosticsNow - diagnosticsTtl,
    }),
    diagnosticRecord({ sequence: 3, timestamp_ms: diagnosticsNow + 1 }),
    diagnosticRecord(),
    diagnosticRecord({ sequence: 4, component: ["act"] }),
    diagnosticRecord({ sequence: 5, stage: ["DISPATCH"] }),
  ];
  const result = convertMg06(source, diagnosticsNow);
  expect(result.sourceCount).toBe(6);
  expect(result.records).toHaveLength(1);
  expect(result.quarantine.map((row) => row.reason)).toEqual([
    "RETENTION_EXPIRED",
    "FUTURE_TIMESTAMP",
    "DUPLICATE_SEQUENCE",
    "INVALID_RECORD",
    "INVALID_RECORD",
  ]);
});
it("handles empty and historical controls without enabling trace or importing unsupported containers", () => {
  expect(convertMg06({}, diagnosticsNow).sourceCount).toBe(0);
  expect(
    convertMg06({ execution_diagnostics_v1: null }, diagnosticsNow).sourceCount,
  ).toBe(0);
  const source = diagnosticsSource();
  source.execution_diagnostics_v1.level = "basic";
  expect(convertMg06(source, diagnosticsNow).records).toHaveLength(1);
  expect(
    convertMg06(
      {
        execution_diagnostics_v1: {
          ...source.execution_diagnostics_v1,
          raw_traces: "PRIVATE_TRACE",
        },
      },
      diagnosticsNow,
    ).quarantine,
  ).toEqual([{ sourceIndex: -1, reason: "INVALID_CONTAINER" }]);
  expect(() => convertMg06(source, -1)).toThrow("MG06_CLOCK");
});

it("matches the coordinator's canonical hex SHA-256 contract without changing legacy Browser encoding", async () => {
  const { createHash } = await import("node:crypto");
  const { canonicalJson } = await import(
    "../../../../src/security/canonical.js"
  );
  const { migrationDigest } = await import(
    "../../../../../apps/chrome-extension/src/migration/migration-digest.js"
  );
  const value = { second: "한글", first: [0, true, null] };
  expect(migrationDigest(value)).toBe(
    createHash("sha256").update(canonicalJson(value)).digest("hex"),
  );
});
