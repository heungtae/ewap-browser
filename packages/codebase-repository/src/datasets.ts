import { readAll, enforceCapacity } from "./capacity.js";
import {
  bytes,
  datasetBodySchema,
  datasetSchema,
  digest,
  type Dataset,
  type DatasetBody,
} from "@contextpilot/codebase-schema";
import { completed, key, request, stores, type Stored } from "./database.js";
import { stored } from "./records.js";
export async function makeDataset(input: DatasetBody): Promise<Dataset> {
  const body = datasetBodySchema.parse(input);
  if (bytes(body) > 8 * 1024 * 1024) throw new Error("DATASET_BYTE_LIMIT");
  return datasetSchema.parse({ ...body, digest: await digest(body) });
}
export async function writeDataset(
  db: IDBDatabase,
  input: unknown,
  now: number,
  capacity = 100 * 1024 * 1024,
): Promise<void> {
  const data = datasetSchema.parse(input);
  const { digest: expected, ...body } = data;
  if (
    bytes(body) > 8 * 1024 * 1024 ||
    (await digest(body)) !== expected ||
    data.expiresAt <= now
  )
    throw new Error("DATASET_INTEGRITY");
  const chunks: Dataset["rows"][] = [];
  let pending: Dataset["rows"] = [];
  for (const row of data.rows) {
    if (pending.length >= 200 || bytes([...pending, row]) > 256 * 1024) {
      chunks.push(pending);
      pending = [];
    }
    pending.push(row);
  }
  if (pending.length) chunks.push(pending);
  if (chunks.length > 50) throw new Error("DATASET_CHUNK_LIMIT");
  const manifest = { ...data, rows: [], chunks: chunks.length };
  const rows = [
    stored(
      key(data.partitionId, data.pageKey, data.id),
      data.partitionId,
      data.pageKey,
      "dataset",
      manifest,
      now,
      data.expiresAt - now,
    ),
    ...chunks.map((rows, index) =>
      stored(
        key(data.partitionId, data.pageKey, data.id, index),
        data.partitionId,
        data.pageKey,
        "chunk",
        rows,
        now,
        data.expiresAt - now,
      ),
    ),
  ];
  const tx = db.transaction([...stores], "readwrite");
  const done = completed(tx);
  try {
    const page = (await request(
      tx
        .objectStore("pages")
        .get(key(data.partitionId, data.pageKey, "current")),
    )) as Stored | undefined;
    if (
      !page ||
      (page.value as { revision: number }).revision !== data.graphRevision
    )
      throw new Error("DATASET_GRAPH_STALE");
    const allowed = new Set(
      (page.value as { evidence: { id: string }[] }).evidence.map((e) => e.id),
    );
    if (data.evidenceIds.some((id) => !allowed.has(id)))
      throw new Error("DATASET_EVIDENCE_SCOPE");
    const old = (await request(
      tx.objectStore("datasets").get(rows[0]!.key),
    )) as Stored | undefined;
    if (old) {
      if ((old.value as { digest: string }).digest !== data.digest)
        throw new Error("DATASET_CONFLICT");
      await done;
      return;
    }
    const all = await readAll(tx);
    enforceCapacity(
      tx,
      all,
      rows.map((record, index) => ({
        store: index === 0 ? ("datasets" as const) : ("datasetChunks" as const),
        record,
      })),
      capacity,
      now,
      data.pageKey,
    );
    tx.objectStore("datasets").add(rows[0]!);
    rows.slice(1).forEach((row) => tx.objectStore("datasetChunks").add(row));
    await done;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* transaction already settled */
    }
    await done.catch(() => undefined);
    throw error;
  }
}
export async function readDataset(
  db: IDBDatabase,
  partition: string,
  page: string,
  id: string,
  now: number,
): Promise<Dataset> {
  const tx = db.transaction(["datasets", "datasetChunks", "pages"], "readonly");
  const done = completed(tx);
  const item = (await request(
    tx.objectStore("datasets").get(key(partition, page, id)),
  )) as Stored | undefined;
  if (!item || item.expiresAt <= now) {
    await done;
    throw new Error("DATASET_EXPIRED_OR_ABSENT");
  }
  const value = item.value as Dataset & { chunks: number };
  const rows: Dataset["rows"] = [];
  if (
    !Number.isSafeInteger(value.chunks) ||
    value.chunks < 0 ||
    value.chunks > 50
  ) {
    await done;
    throw new Error("DATASET_CHUNK_LIMIT");
  }
  for (let index = 0; index < value.chunks; index++) {
    const chunk = (await request(
      tx.objectStore("datasetChunks").get(key(partition, page, id, index)),
    )) as Stored | undefined;
    if (!chunk) {
      await done;
      throw new Error("DATASET_CHUNK_MISSING");
    }
    rows.push(...(chunk.value as Dataset["rows"]));
  }
  const current = (await request(
    tx.objectStore("pages").get(key(partition, page, "current")),
  )) as Stored | undefined;
  await done;
  if (
    !current ||
    (current.value as { revision: number }).revision !== value.graphRevision
  )
    throw new Error("DATASET_GRAPH_STALE");
  const { chunks: _chunks, ...data } = value;
  const result = datasetSchema.parse({ ...data, rows });
  const { digest: expected, ...body } = result;
  if ((await digest(body)) !== expected) throw new Error("DATASET_INTEGRITY");
  return result;
}
