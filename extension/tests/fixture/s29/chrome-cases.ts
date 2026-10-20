import { runScope } from "./chrome-scope.js";
import { DomCollector } from "../../../../apps/chrome-extension/src/codebase/dom-collector.js";
import { checkAtomic } from "./chrome-atomic.js";
import { runLimits } from "./chrome-limits.js";
import {
  buildGraph,
  identifyContext,
} from "../../../../packages/codebase-builder/src/index.js";
import {
  openDatabase,
  CodebaseRepository,
  CodebaseReadService,
} from "../../../../packages/codebase-repository/src/index.js";
import { discover } from "../../../../apps/chrome-extension/src/codebase/discover.js";
const source = (sequence: number) => ({
  tabId: 1,
  frameId: 0,
  documentEpoch: 1,
  routeEpoch: 1,
  sourceRevision: sequence,
  sequence,
  cancellationGeneration: 0,
});
const assert = (ok: unknown, message: string): void => {
  if (!ok) throw new Error(message);
};
export async function runCases() {
  document.body.innerHTML =
    '<form aria-label="Search"><input aria-label="Query" value="NEVER_STORE_INPUT"/><button id="search">Search</button></form><table aria-label="Outer"><tr><th>Outer value</th></tr><tr><td>outer<table aria-label="Inner"><tr><th>Inner value</th></tr><tr><td>inner</td></tr></table></td></tr></table><div data-private>NEVER_STORE_PRIVATE</div><input type="password" value="NEVER_STORE_PASSWORD"/><button hidden>Hidden</button><button id="save">Save</button>';
  let current = await identifyContext({
    taskId: "task_chrome",
    profile: "chrome_fixture",
    url: location.href,
    accountGuard: "account_a",
    source: source(1),
  });
  const db = await openDatabase(indexedDB, current.profileGuard);
  const repository = new CodebaseRepository(db, current.profileGuard);
  const signal = new AbortController();
  const first = await discover(
    {
      deadline: Date.now() + 10000,
      batchId: "batch_first",
      context: current,
      expectedRevision: 0,
      readAllowed: true,
      scope: "all_dom",
      signal: signal.signal,
    },
    new DomCollector(document.body, () => current),
    repository,
    () => current,
  );
  const json = JSON.stringify(first.delta);
  assert(!json.includes("NEVER_STORE"), "privacy");
  const grids = first.delta.entities.filter((e) => e.kind === "table");
  assert(grids.length === 2, "nested table boundaries");
  assert(grids[1]!.parentId === grids[0]!.id, "nested table parent");
  const outer = first.delta.entities.find(
    (e) => e.kind === "data" && e.name === "Outer",
  );
  assert(
    !JSON.stringify(outer?.sample).includes("inner"),
    "nested rows flattened",
  );
  assert(
    first.delta.entities
      .filter((e) => e.kind === "action")
      .every((e) => e.capability?.executable === false),
    "persistent authority",
  );
  current = { ...current, source: source(2) };
  const second = await discover(
    {
      deadline: Date.now() + 10000,
      batchId: "batch_revisit",
      context: current,
      expectedRevision: 1,
      readAllowed: true,
      scope: "all_dom",
      signal: signal.signal,
    },
    new DomCollector(document.body, () => current),
    repository,
    () => current,
    first.delta.entities,
  );
  const before = first.delta.entities.find(
    (e) => e.kind === "control" && e.name === "Save",
  )!;
  assert(
    second.delta.entities.some((e) => e.id === before.id),
    "revisit identity",
  );
  document.querySelector("#save")!.remove();
  current = { ...current, source: source(3) };
  const changed = await discover(
    {
      deadline: Date.now() + 10000,
      batchId: "batch_delta",
      context: current,
      expectedRevision: 2,
      readAllowed: true,
      scope: "all_dom",
      signal: signal.signal,
    },
    new DomCollector(document.body, () => current),
    repository,
    () => current,
    second.delta.entities,
  );
  assert(
    changed.delta.invalidations.includes(before.id),
    "removed dependency invalidation",
  );
  const readers = new CodebaseReadService(
    repository,
    current.partitionId,
    current.pageKey,
  );
  const result = await readers.search({
    name: "Search",
    limit: 10,
    revision: 3,
  });
  assert(result.entities.length > 0, "search port");
  const late = await buildGraph({
    ...second.batch,
    context: second.batch.context,
  });
  // A second connection uses the real browser transaction scheduler for CAS.
  const db2 = await openDatabase(indexedDB, current.profileGuard);
  const repo2 = new CodebaseRepository(db2, current.profileGuard);
  const snapshot = await repo2.snapshot(current.partitionId, current.pageKey);
  assert(snapshot.revision === 3, "cross connection projection");
  await assertRejected(repository.commit(late), "stale commit accepted");
  db2.close();
  const atomic = await checkAtomic(current, repository, changed.delta.entities);
  const limits = await runLimits(current);
  const scope = await runScope(current);
  const physicalStorage = await navigator.storage.estimate();
  db.close();
  return {
    first: first.batch.coverage,
    revisitRevision: 2,
    deltaRevision: 3,
    ...limits,
    ...atomic,
    ...scope,
    privacy: true,
    realIndexedDB: true,
    physicalStorage: {
      usage: physicalStorage.usage ?? null,
      quota: physicalStorage.quota ?? null,
    },
  };
}
async function assertRejected(promise: Promise<unknown>, message: string) {
  try {
    await promise;
  } catch {
    return;
  }
  throw new Error(message);
}
