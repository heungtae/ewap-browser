import {
  snapshotSchema,
  type ManagementCommand,
} from "@contextpilot/codebase-schema";
import { request, key, stores, type Stored } from "./database.js";
import {
  catalog,
  control,
  controlRecord,
  catalogRecord,
  controlKey,
} from "./advisory-controls.js";
import { advisoryItem, managedProfile } from "./advisory-page.js";
import { deleteAdvisory } from "./advisory-delete.js";
import { scanIndex } from "./management-scan.js";
import { readAll, enforceCapacity } from "./capacity.js";
import type { WriteRecord } from "./records.js";
type Command = Extract<ManagementCommand, { revision: number }>;
export async function manageWrite(
  tx: IDBTransaction,
  command: Command,
  now: number,
  current: () => boolean,
  capacity: number,
) {
  const state = await catalog(tx);
  if (state.revision !== command.revision) throw Error("MANAGEMENT_STALE");
  const writes: WriteRecord[] = [];
  if (command.kind === "advisory.feature") state.enabled = command.enabled;
  else if (command.kind === "advisory.clear") {
    const scan = await scanIndex(
      tx.objectStore("entities").index("kind"),
      "workflow",
      null,
      async (row) => {
        const item = await advisoryItem(tx, row);
        if (item?.source === "learned") {
          writes.push(...(await deleteAdvisory(tx, row, now)));
          tx.objectStore("migrationJournal").delete(
            controlKey(row.partitionId, row.pageKey),
          );
        }
        return true;
      },
      current,
      200000,
    );
    if (scan.partial) throw Error("CACHE_RECORD_LIMIT");
  } else {
    const { partitionId, pageKey } = command.scope;
    const profile =
      command.id === null
        ? await managedProfile(tx, partitionId, pageKey, now, null, 1, current)
        : null;
    const row =
      command.id !== null
        ? ((await request(
            tx
              .objectStore("entities")
              .get(key(partitionId, pageKey, command.id)),
          )) as Stored | undefined)
        : undefined;
    const item = row ? await advisoryItem(tx, row) : null;
    if (command.id === null ? !profile : !item)
      throw Error("ADVISORY_UNAVAILABLE");
    if (command.kind === "advisory.delete") {
      if (row) writes.push(...(await deleteAdvisory(tx, row, now)));
      else {
        const rows = (await request(
          tx
            .objectStore("entities")
            .index("scopeKind")
            .getAll([partitionId, pageKey, "workflow"], 200001),
        )) as Stored[];
        if (rows.length > 200000) throw Error("CACHE_RECORD_LIMIT");
        for (const candidate of rows) {
          if (!current()) throw Error("MANAGEMENT_EXPIRED");
          if ((await advisoryItem(tx, candidate))?.source === "learned")
            writes.push(...(await deleteAdvisory(tx, candidate, now)));
        }
        tx.objectStore("migrationJournal").delete(
          controlKey(partitionId, pageKey),
        );
      }
    } else {
      const flags = await control(
        tx,
        partitionId,
        pageKey,
        command.id ?? undefined,
      );
      if (command.kind === "advisory.update") {
        if (command.id !== null && command.patch.notes !== undefined)
          throw Error("MANAGEMENT_INVALID");
        Object.assign(flags, command.patch);
      } else {
        const page = (await request(
          tx.objectStore("pages").get(key(partitionId, pageKey, "current")),
        )) as Stored;
        flags.rediscoverRevision =
          item?.sourceRevision ?? snapshotSchema.parse(page.value).revision;
      }
      writes.push({
        store: "migrationJournal",
        record: controlRecord(
          partitionId,
          pageKey,
          flags,
          now,
          command.id ?? undefined,
        ),
      });
    }
  }
  state.revision++;
  writes.push({ store: "migrationJournal", record: catalogRecord(state, now) });
  if (!current()) throw Error("MANAGEMENT_EXPIRED");
  enforceCapacity(
    tx,
    await readAll(tx),
    writes,
    capacity,
    now,
    "scope" in command ? command.scope.pageKey : "catalog",
  );
  for (const write of writes) tx.objectStore(write.store).put(write.record);
  // Every store is locked by the caller, including page/graph writers.
  if (tx.objectStoreNames.length !== stores.length || !current())
    throw Error("MANAGEMENT_EXPIRED");
  return state;
}
