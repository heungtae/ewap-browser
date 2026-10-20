import { readAll, enforceCapacity } from "./capacity.js";
import {
  digest,
  snapshotSchema,
  validateDelta,
  type Snapshot,
} from "@contextpilot/codebase-schema";
import { completed, key, request, stores, type Stored } from "./database.js";
import { graphRecords, type WriteRecord } from "./records.js";
export interface CommitResult {
  revision: number;
  digest: string;
  duplicate: boolean;
}
function newer(
  next: Snapshot["context"]["source"],
  old: Snapshot["context"]["source"],
): boolean {
  if (next.tabId !== old.tabId || next.frameId !== old.frameId) return false;
  if (next.documentEpoch !== old.documentEpoch)
    return next.documentEpoch > old.documentEpoch;
  if (next.routeEpoch !== old.routeEpoch)
    return next.routeEpoch > old.routeEpoch;
  return (
    next.sourceRevision >= old.sourceRevision &&
    next.sequence > old.sequence &&
    next.cancellationGeneration >= old.cancellationGeneration
  );
}
export async function commitGraph(
  db: IDBDatabase,
  profileGuard: string,
  input: unknown,
  now: number,
  capacity: number,
  isCurrent: () => boolean = () => true,
): Promise<CommitResult> {
  const delta = await validateDelta(input);
  const c = delta.context;
  if (c.profileGuard !== profileGuard) throw new Error("PROFILE_MISMATCH");
  if (
    delta.coverage.reasons.some((r) =>
      ["CANCELLED", "DOCUMENT_CHANGED"].includes(r),
    )
  )
    throw new Error("LATE_DELTA");
  const body = {
    repositoryId: `repo_${profileGuard.slice(0, 40)}`,
    generation: delta.generation,
    partitionId: c.partitionId,
    pageKey: c.pageKey,
    revision: delta.expectedRevision + 1,
    context: c,
    entities: delta.entities,
    edges: delta.edges,
    evidence: delta.evidence,
    coverage: delta.coverage,
    expiresAt: now + 30 * 86400000,
  };
  const snapshot = snapshotSchema.parse({
    ...body,
    digest: await digest(body),
  });
  const writes = graphRecords(delta, snapshot, now);
  const tx = db.transaction([...stores], "readwrite");
  const done = completed(tx);
  try {
    const prior = (await request(
      tx
        .objectStore("migrationJournal")
        .get(key(c.partitionId, c.pageKey, delta.batchId)),
    )) as Stored | undefined;
    if (prior) {
      const value = prior.value as {
        digest: string;
        revision: number;
        snapshotDigest: string;
      };
      if (value.digest !== delta.digest) throw new Error("BATCH_CONFLICT");
      await done;
      return {
        revision: value.revision,
        digest: value.snapshotDigest,
        duplicate: true,
      };
    }
    const current = (await request(
      tx.objectStore("pages").get(key(c.partitionId, c.pageKey, "current")),
    )) as Stored | undefined;
    const previous = current?.value as Snapshot | undefined;
    if ((previous?.revision ?? 0) !== delta.expectedRevision)
      throw new Error("REVISION_CONFLICT");
    if (previous && !newer(c.source, previous.context.source))
      throw new Error("SOURCE_STALE");
    const all = await readAll(tx);
    for (const item of writes.filter((w) => w.store === "evidence")) {
      const old = all.find(
        (w) => w.store === "evidence" && w.record.key === item.record.key,
      );
      if (
        old &&
        JSON.stringify(old.record.value) !== JSON.stringify(item.record.value)
      )
        throw new Error("IMMUTABLE_EVIDENCE_CONFLICT");
    }
    applyInvalidations(
      writes,
      all,
      delta.invalidations,
      delta.tombstones,
      c.partitionId,
      c.pageKey,
    );
    enforceCapacity(tx, all, writes, capacity, now, c.pageKey);
    if (!isCurrent()) throw new Error("LATE_DELTA");
    for (const { store, record } of writes) tx.objectStore(store).put(record);
    await done;
    return {
      revision: snapshot.revision,
      digest: snapshot.digest,
      duplicate: false,
    };
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* already aborted */
    }
    await done.catch(() => undefined);
    throw error;
  }
}
function applyInvalidations(
  writes: WriteRecord[],
  all: WriteRecord[],
  invalidations: string[],
  tombstones: string[],
  partition: string,
  page: string,
): void {
  const current = new Set(writes.map((w) => key(w.store, w.record.key)));
  const ids = new Set([...invalidations, ...tombstones]);
  for (const item of all) {
    if (
      item.store !== "edges" ||
      item.record.partitionId !== partition ||
      item.record.pageKey !== page ||
      current.has(key(item.store, item.record.key))
    )
      continue;
    const edge = item.record.value as { from: string; to: string };
    if (ids.has(edge.from) || ids.has(edge.to))
      writes.push({
        store: "edges",
        record: {
          ...item.record,
          status: "stale",
          value: { ...edge, status: "stale" },
        },
      });
  }
  for (const item of all) {
    if (
      item.store !== "entities" ||
      item.record.partitionId !== partition ||
      item.record.pageKey !== page ||
      current.has(key(item.store, item.record.key))
    )
      continue;
    const value = item.record.value as { id: string; status: string };
    if (!ids.has(value.id)) continue;
    const status = tombstones.includes(value.id) ? "tombstone" : "stale";
    writes.push({
      store: "entities",
      record: { ...item.record, status, value: { ...value, status } },
    });
  }
}
