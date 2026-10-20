import { collect } from "../../../../packages/collector/src/index.js";
import { buildGraph } from "../../../../packages/codebase-builder/src/index.js";
import {
  CodebaseRepository,
  openDatabase,
} from "../../../../packages/codebase-repository/src/index.js";
import type {
  Context,
  Entity,
} from "../../../../packages/codebase-schema/src/index.js";
const assert = (value: unknown, message: string) => {
  if (!value) throw new Error(message);
};
export async function checkAtomic(
  context: Context,
  repository: CodebaseRepository,
  prior: Entity[],
) {
  const nextContext = (sequence: number) => ({
    ...context,
    source: { ...context.source, sourceRevision: sequence, sequence },
  });
  const make = async (sequence: number, id: string) =>
    buildGraph(
      await collect(document.body, {
        batchId: id,
        context: nextContext(sequence),
        expectedRevision: 3,
        scope: "all_dom",
        current: () => true,
      }),
      prior,
    );
  const failed = await make(4, "batch_quota");
  const original = IDBObjectStore.prototype.put;
  try {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException(
        "Injected storage quota failure",
        "QuotaExceededError",
      );
    };
    let rejected = false;
    try {
      await repository.commit(failed);
    } catch {
      rejected = true;
    }
    assert(rejected, "injected quota accepted");
  } finally {
    IDBObjectStore.prototype.put = original;
  }
  assert(
    (await repository.snapshot(context.partitionId, context.pageKey))
      .revision === 3,
    "quota damaged committed graph",
  );
  const db = await openDatabase(indexedDB, context.profileGuard);
  try {
    const second = new CodebaseRepository(db, context.profileGuard);
    const [a, b] = await Promise.all([
      make(4, "batch_race_one"),
      make(5, "batch_race_two"),
    ]);
    const settled = await Promise.allSettled([
      repository.commit(a),
      second.commit(b),
    ]);
    assert(
      settled.filter((r) => r.status === "fulfilled").length === 1,
      "CAS race allowed multiple writers",
    );
    assert(
      (await second.snapshot(context.partitionId, context.pageKey)).revision ===
        4,
      "CAS revision",
    );
  } finally {
    db.close();
  }
  return {
    injectedQuotaAbort: true,
    realConnectionCas: true,
    postRaceRevision: 4,
  };
}
