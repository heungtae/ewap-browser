import { randomUUID } from "node:crypto";
import {
  buildGraph,
  identifyContext,
} from "../../../../../packages/codebase-builder/src/index.js";
import {
  pairedCodebaseProfile,
  type ProjectionRequest,
  type ProjectionLease,
} from "../../../../../packages/codebase-schema/src/index.js";
import {
  CodebaseRepository,
  CodebaseReadService,
  openDatabase,
  makeDataset,
  writeDataset,
} from "../../../../../packages/codebase-repository/src/index.js";
import { ProjectionRegistry } from "../../../../../apps/chrome-extension/src/codebase/projection-registry.js";
import { batch, observation } from "./support.js";
export async function projectionFixture(rows = 3, padding = 0) {
  const pairing = {
    installationId: randomUUID(),
    profileId: randomUUID(),
    extensionId: "a".repeat(32),
    secret: "b".repeat(64),
  };
  const now = Date.now();
  const context = await identifyContext({
    taskId: "task_projection",
    profile: pairedCodebaseProfile(pairing.installationId, pairing.profileId),
    url: "https://fixture.test/values",
    accountGuard: "synthetic_account",
    source: (await batch()).context.source,
  });
  const input = await batch(
    [
      observation({
        kind: "grid",
        role: "grid",
        name: "Values",
        control: null,
        headers: ["value"],
        sample: [["SAMPLE_CANARY"]],
      }),
      observation({ evidenceId: "ev_save" }),
    ],
    1,
    0,
    {
      context,
      observedAt: now,
      coverage: {
        status: "complete",
        examined: 2,
        emitted: 2,
        omitted: 0,
        redactions: 0,
        total: 2,
        reasons: [],
        startedAt: now,
        endedAt: now,
        deadline: now + 10000,
      },
    },
  );
  const graph = await buildGraph(input);
  const db = await openDatabase(
    new (await import("fake-indexeddb")).IDBFactory(),
    context.profileGuard,
  );
  const repo = new CodebaseRepository(db, context.profileGuard);
  await repo.commit(graph);
  const data = await makeDataset({
    schema: "wca.codebase/v1",
    kind: "dataset",
    id: "dataset_projection",
    partitionId: context.partitionId,
    pageKey: context.pageKey,
    graphRevision: 1,
    fields: [
      { name: "value", type: "number", unit: "ms" },
      ...(padding
        ? [{ name: "padding", type: "string" as const, unit: null }]
        : []),
    ],
    rows: Array.from({ length: rows }, (_, i) => [
      i % 3 === 2 ? null : i + 1,
      ...(padding ? ["한".repeat(padding)] : []),
    ]),
    rowIds: Array.from({ length: rows }, (_, i) => `row_${i}`),
    source: "static",
    evidenceIds: graph.evidence.map((e) => e.id),
    observedAt: now,
    expiresAt: now + 60000,
    coverage: { ...graph.coverage, examined: rows, emitted: rows, total: rows },
  });
  await writeDataset(db, data, now);
  let live = true;
  const stop = new AbortController();
  const read = new CodebaseReadService(
    repo,
    context.partitionId,
    context.pageKey,
    () => live && !stop.signal.aborted,
  );
  const admission = {
    runtimeEpoch: 1,
    documentId: "document_fixture",
    deadline: now + 30000,
    signal: stop.signal,
    current: () => live,
    permissions: {
      graph: true,
      samples: true,
      datasets: [{ id: data.id, digest: data.digest }],
    },
  };
  const registry = new ProjectionRegistry(context.profileGuard);
  const lease = await registry.install(read, admission);
  const request = (
    operation: ProjectionRequest["operation"],
    selected: ProjectionLease = lease,
  ): ProjectionRequest => ({
    schema: "wca.codebase-projection/v1",
    kind: "codebase.request",
    requestId: randomUUID(),
    connectionId: randomUUID(),
    connectionEpoch: 1,
    leaseId: selected.id,
    scope: selected.scope,
    operation,
    deadline: Date.now() + 5000,
    maxBytes: 8 * 1024 * 1024,
  });
  return {
    pairing,
    graph,
    db,
    repo,
    data,
    read,
    registry,
    lease,
    admission,
    request,
    revoke() {
      live = false;
    },
    close() {
      stop.abort();
      registry.clear();
      db.close();
    },
  };
}
