import { migrationDigest } from "./migration-digest.js";
import { canonicalJson } from "../../../../extension/src/security/canonical.js";
import type { FrozenSource } from "./local-staging.js";
import type { DiagnosticsSnapshot } from "./mg06-convert.js";
export async function diagnosticsSource(source: FrozenSource, epoch: number) {
  await source.assertFrozen(epoch);
  const raw = await source.get(["execution_diagnostics_v1"]);
  const snapshot: DiagnosticsSnapshot = Object.hasOwn(
    raw,
    "execution_diagnostics_v1",
  )
    ? structuredClone({
        execution_diagnostics_v1: raw.execution_diagnostics_v1,
      })
    : {};
  if (
    new TextEncoder().encode(canonicalJson(snapshot)).length >
    4 * 1024 * 1024
  )
    throw new Error("MG06_SOURCE_LIMIT");
  return { snapshot, digest: migrationDigest(snapshot) };
}
