import { isPlainObject } from "../security/validation.js";
import { validateCatalog, validateProfile } from "./validation.js";
import type { LearnedCatalog } from "./types.js";
export function readLearnedCatalog(raw: unknown): LearnedCatalog {
  if (raw === undefined)
    return {
      schema_version: 1,
      catalog_revision: 0,
      enabled: true,
      records: [],
      receipts: [],
    };
  try {
    return validateCatalog(raw);
  } catch {
    if (
      !isPlainObject(raw) ||
      raw.schema_version !== 1 ||
      !Number.isSafeInteger(raw.catalog_revision) ||
      (raw.catalog_revision as number) < 0 ||
      typeof raw.enabled !== "boolean" ||
      !Array.isArray(raw.records)
    )
      throw new Error("INVALID_LEARNED_CATALOG");
    const records = raw.records.slice(0, 100).flatMap((record) => {
      try {
        const candidate =
          isPlainObject(record) && record.commands === undefined
            ? { ...record, commands: [] }
            : record;
        return [validateProfile(candidate)];
      } catch {
        return [];
      }
    });
    return validateCatalog({
      schema_version: 1,
      catalog_revision: raw.catalog_revision,
      enabled: raw.enabled,
      records,
      receipts: [],
    });
  }
}
