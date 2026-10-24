import { validateWorkflowCatalogState } from "../../../../extension/src/contracts/workflow-catalog.js";
import { isPlainObject } from "../../../../extension/src/security/validation.js";
import { digestCanonical } from "../../../../extension/src/security/canonical.js";
import { learnedMetadata } from "./mg03-learned.js";
import { sourceKeys, type Snapshot, type Conversion } from "./mg03-types.js";
export function convertMg03(snapshot: Snapshot): Conversion {
  const result: Conversion = {
    schema: "wca.mg03-advisory/v1",
    records: [],
    quarantine: [],
    sourceCount: 0,
  };
  for (const sourceKey of sourceKeys) {
    if (!(sourceKey in snapshot)) continue;
    const container = snapshot[sourceKey];
    const learned = sourceKey === "learned_page_profiles_v1";
    const allowed = learned
      ? ["schema_version", "catalog_revision", "enabled", "records", "receipts"]
      : ["schema_version", "records"];
    if (
      !isPlainObject(container) ||
      container.schema_version !== 1 ||
      Object.keys(container).some((key) => !allowed.includes(key)) ||
      !Array.isArray(container.records) ||
      container.records.length > 100 ||
      (learned &&
        (typeof container.enabled !== "boolean" ||
          !Number.isSafeInteger(container.catalog_revision) ||
          (container.catalog_revision as number) < 0 ||
          !Array.isArray(container.receipts) ||
          container.receipts.length > 256 ||
          !container.receipts.every(
            (item) => typeof item === "string" && /^[a-f0-9-]{36}$/.test(item),
          )))
    ) {
      result.sourceCount++;
      result.quarantine.push({
        sourceKey,
        sourceIndex: -1,
        reason: "INVALID_CONTAINER",
      });
      continue;
    }
    const ids = new Set<string>();
    for (const [sourceIndex, raw] of container.records.entries()) {
      result.sourceCount++;
      try {
        let id: string;
        let metadata: unknown;
        if (learned)
          ({ id, metadata } = learnedMetadata(
            raw,
            container.enabled as boolean,
          ));
        else {
          const record = validateWorkflowCatalogState({
            schema_version: 1,
            records: [raw],
          }).records[0]!;
          id = record.id;
          // Keep logical steps as untrusted advisory data; never copy old fingerprint as a current binding.
          const { fingerprint: _fingerprint, ...advisory } = record;
          metadata = { kind: "saved_workflow", ...advisory };
        }
        if (ids.has(id)) {
          result.quarantine.push({
            sourceKey,
            sourceIndex,
            reason: "DUPLICATE_ID",
          });
          continue;
        }
        ids.add(id);
        result.records.push({
          sourceKey,
          sourceIndex,
          sourceId: id,
          sourceDigest: digestCanonical(raw),
          executable: false,
          requiresFreshValidation: true,
          metadata,
        });
      } catch {
        result.quarantine.push({
          sourceKey,
          sourceIndex,
          reason: "INVALID_RECORD",
        });
      }
    }
  }
  return result;
}
