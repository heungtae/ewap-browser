import {
  bytes,
  type Delta,
  type Snapshot,
} from "@contextpilot/codebase-schema";
import { key, type Stored, type StoreName } from "./database.js";
export interface WriteRecord {
  store: StoreName;
  record: Stored;
}
export function stored(
  keyValue: string,
  partitionId: string,
  pageKey: string,
  kind: string,
  value: unknown,
  now: number,
  ttl = 30 * 86400000,
): Stored {
  const v = value as {
    parentId?: string;
    name?: string;
    status?: string;
    sourceLocation?: string;
  };
  const record: Stored = {
    key: keyValue,
    partitionId,
    pageKey,
    kind,
    parentId: v.parentId ?? "",
    name: (v.name ?? "").normalize("NFC").toLowerCase(),
    status: v.status ?? "observed",
    source: v.sourceLocation ?? "",
    time: now,
    bytes: 0,
    pinUntil: 0,
    expiresAt: now + ttl,
    value,
  };
  // Reserve conservatively for key/index overhead; physical usage is measured separately.
  record.bytes = 2 * bytes(record) + 512;
  return record;
}
export function graphRecords(
  delta: Delta,
  snapshot: Snapshot,
  now: number,
): WriteRecord[] {
  const c = delta.context;
  const make = (
    store: StoreName,
    id: string,
    kind: string,
    value: unknown,
  ): WriteRecord => ({
    store,
    record: stored(
      key(c.partitionId, c.pageKey, id),
      c.partitionId,
      c.pageKey,
      kind,
      value,
      now,
    ),
  });
  return [
    make("partitions", "identity", "partition", {
      profileGuard: c.profileGuard,
      origin: c.origin,
      accountKnown: c.accountKnown,
    }),
    make("pages", "current", "page", snapshot),
    make("versions", String(snapshot.revision), "version", snapshot),
    ...delta.entities.map((e) => make("entities", e.id, e.kind, e)),
    ...delta.edges.map((e) => make("edges", e.id, e.kind, e)),
    ...delta.evidence.map((e) => make("evidence", e.id, "evidence", e)),
    ...delta.tombstones.map((id) =>
      make("tombstones", id, "tombstone", { id, revision: snapshot.revision }),
    ),
    make("migrationJournal", delta.batchId, "commit", {
      digest: delta.digest,
      batchDigest: delta.batchDigest,
      revision: snapshot.revision,
      snapshotDigest: snapshot.digest,
    }),
  ];
}
