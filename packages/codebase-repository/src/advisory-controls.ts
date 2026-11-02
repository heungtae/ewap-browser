import {
  advisoryHistorySchema,
  advisoryCatalogSchema,
  advisoryControlSchema,
  type AdvisoryControl,
} from "@contextpilot/codebase-schema";
import { key, request, type Stored } from "./database.js";
import { stored } from "./records.js";
export const catalogKey = key("catalog", "catalog", "advisory_controls");
export const controlKey = (partition: string, page: string, id?: string) =>
  key(
    partition,
    page,
    id ? `advisory_control_${id}` : "advisory_profile_control",
  );
export async function catalog(tx: IDBTransaction) {
  const row = (await request(
    tx.objectStore("migrationJournal").get(catalogKey),
  )) as Stored | undefined;
  return row
    ? advisoryCatalogSchema.parse(row.value)
    : { revision: 0, enabled: true };
}
export async function control(
  tx: IDBTransaction,
  partition: string,
  page: string,
  id?: string,
): Promise<AdvisoryControl> {
  const row = (await request(
    tx.objectStore("migrationJournal").get(controlKey(partition, page, id)),
  )) as Stored | undefined;
  return row ? advisoryControlSchema.parse(row.value) : {};
}
export function controlRecord(
  partition: string,
  page: string,
  value: AdvisoryControl,
  now: number,
  id?: string,
) {
  return stored(
    controlKey(partition, page, id),
    partition,
    page,
    "advisory_control",
    advisoryControlSchema.parse(value),
    now,
    Number.MAX_SAFE_INTEGER - now,
  );
}
export function catalogRecord(
  value: { revision: number; enabled: boolean },
  now: number,
) {
  return stored(
    catalogKey,
    "catalog",
    "catalog",
    "advisory_catalog",
    advisoryCatalogSchema.parse(value),
    now,
    Number.MAX_SAFE_INTEGER - now,
  );
}
export async function importAllowed(
  tx: IDBTransaction,
  partition: string,
  page: string,
  id: string,
  source: string,
) {
  if (source !== "learned") return;
  const global = await catalog(tx),
    profile = await control(tx, partition, page),
    recipe = await control(tx, partition, page, id);
  if (
    !global.enabled ||
    profile.enabled === false ||
    profile.autoUpdate === false ||
    recipe.enabled === false ||
    recipe.autoUpdate === false
  )
    throw Error("IMPORT_MANAGEMENT_DISABLED");
}

export function decodeAdvisoryHistory(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const { digest: _digest, ...history } = value as Record<string, unknown>;
    return advisoryHistorySchema.safeParse(history);
  }
  return advisoryHistorySchema.safeParse(value);
}
