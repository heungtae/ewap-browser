import { decodeAdvisoryHistory } from "./advisory-controls.js";
import {
  entitySchema,
  snapshotSchema,
  type AdvisoryItem,
  type ManagedProfile,
} from "@contextpilot/codebase-schema";
import { key, request, type Stored } from "./database.js";
import { control } from "./advisory-controls.js";
export async function advisoryItem(
  tx: IDBTransaction,
  row: Stored,
): Promise<AdvisoryItem | null> {
  const entity = entitySchema.parse(row.value);
  if (
    entity.kind !== "workflow" ||
    entity.status !== "advisory" ||
    entity.capability !== null
  )
    return null;
  const source = (await request(
    tx
      .objectStore("migrationJournal")
      .get(
        key(
          row.partitionId,
          row.pageKey,
          `advisory_${entity.id}_${row.source}`,
        ),
      ),
  )) as Stored | undefined;
  const parsed = decodeAdvisoryHistory(source?.value);
  if (!parsed.success) return null;
  if (
    entity.partitionId !== row.partitionId ||
    entity.pageKey !== row.pageKey ||
    parsed.data.id !== entity.id ||
    parsed.data.sourceRevision !== Number(row.source) ||
    parsed.data.sourceDigest !== entity.structureFingerprint
  )
    throw Error("ADVISORY_INTEGRITY");
  const flags = await control(tx, row.partitionId, row.pageKey, entity.id);
  return {
    id: entity.id,
    name: flags.name ?? entity.name,
    enabled: flags.enabled !== false,
    autoUpdate: flags.autoUpdate !== false,
    source: parsed.data.source,
    sourceRevision: parsed.data.sourceRevision,
    successfulAt: parsed.data.successfulAt,
    stepLabels: parsed.data.stepLabels,
  };
}
export async function managedProfile(
  tx: IDBTransaction,
  partitionId: string,
  pageKey: string,
  now: number,
  after: string | null = null,
  limit = 20,
  current: () => boolean = () => true,
): Promise<ManagedProfile | null> {
  const page = (await request(
    tx.objectStore("pages").get(key(partitionId, pageKey, "current")),
  )) as Stored | undefined;
  if (!page) return null;
  const snapshot = snapshotSchema.parse(page.value);
  if (snapshot.partitionId !== partitionId || snapshot.pageKey !== pageKey)
    throw Error("PROJECTION_INTEGRITY");
  const rows = (await request(
    tx
      .objectStore("entities")
      .index("scopeKind")
      .getAll([partitionId, pageKey, "workflow"], 200001),
  )) as Stored[];
  const recipes: AdvisoryItem[] = [];
  let recipeCount = 0,
    next: string | null = null;
  if (rows.length > 200000) throw Error("CACHE_RECORD_LIMIT");
  for (const row of rows) {
    if (!current()) throw Error("MANAGEMENT_EXPIRED");
    if (row.expiresAt <= now) continue;
    const item = await advisoryItem(tx, row);
    if (item?.source === "learned") {
      recipeCount++;
      if ((after === null || item.id > after) && recipes.length < limit)
        recipes.push(item);
      else if ((after === null || item.id > after) && recipes.length >= limit)
        next = recipes.at(-1)!.id;
    }
  }
  if (!recipeCount) return null;
  const flags = await control(tx, partitionId, pageKey);
  return {
    scope: { partitionId, pageKey },
    name: flags.name ?? "",
    origin: snapshot.context.origin,
    notes: flags.notes ?? "",
    enabled: flags.enabled !== false,
    autoUpdate: flags.autoUpdate !== false,
    updatedAt: recipes.length
      ? Math.max(...recipes.map((r) => r.successfulAt))
      : 0,
    recipes,
    truncated: next !== null,
    recipeCount,
    cursor: next,
  };
}
