import {
  ChromeCollector,
  type CollectorChrome,
} from "../../../../apps/chrome-extension/src/codebase/chrome-collector.js";
import { discover } from "../../../../apps/chrome-extension/src/codebase/discover.js";
import { NativeBridge } from "../../../../apps/chrome-extension/src/bridge/native.js";
import type {
  NativePort,
  Pairing,
} from "../../../../apps/chrome-extension/src/bridge/native-types.js";
import { identifyContext } from "../../../../packages/codebase-builder/src/index.js";
import { pairedCodebaseProfile } from "../../../../packages/codebase-schema/src/index.js";
import {
  CodebaseRepository,
  openDatabase,
  makeDataset,
  writeDataset,
} from "../../../../packages/codebase-repository/src/index.js";
const api = (
  globalThis as typeof globalThis & {
    chrome: CollectorChrome & {
      runtime: { connectNative(name: string): NativePort };
    };
  }
).chrome;
let bridge: NativeBridge;
let collector: ChromeCollector;
export async function publish(tabId: number, pairing: Pairing) {
  const frame = await api.webNavigation.getFrame({ tabId, frameId: 0 });
  if (!frame) throw Error("FRAME_ABSENT");
  collector = new ChromeCollector(api, frame);
  const context = await identifyContext({
    taskId: "task_projection_chrome",
    profile: pairedCodebaseProfile(pairing.installationId, pairing.profileId),
    url: frame.url,
    accountGuard: "synthetic_account",
    source: {
      tabId,
      frameId: 0,
      documentEpoch: 1,
      routeEpoch: 1,
      sourceRevision: 1,
      sequence: 1,
      cancellationGeneration: 0,
    },
  });
  const db = await openDatabase(indexedDB, context.profileGuard);
  const repository = new CodebaseRepository(db, context.profileGuard);
  const stop = new AbortController(),
    deadline = Date.now() + 10000;
  const result = await discover(
    {
      batchId: "batch_projection_chrome",
      context,
      deadline,
      expectedRevision: 0,
      readAllowed: true,
      scope: "all_dom",
      signal: stop.signal,
    },
    collector,
    repository,
    () => context,
  );
  if (JSON.stringify(result.delta).includes("NEVER_STORE"))
    throw Error("PRIVACY");
  const now = Date.now();
  // Synthetic Unicode rows qualify transport only; graph evidence is collected DOM.
  const dataset = await makeDataset({
    schema: "wca.codebase/v1",
    kind: "dataset",
    id: "dataset_projection_chrome",
    partitionId: context.partitionId,
    pageKey: context.pageKey,
    graphRevision: 1,
    fields: [
      { name: "value", type: "number", unit: null },
      { name: "padding", type: "string", unit: null },
    ],
    rows: Array.from({ length: 1000 }, (_, i) => [i, "한".repeat(200)]),
    rowIds: Array.from({ length: 1000 }, (_, i) => `row_${i}`),
    source: "static",
    evidenceIds: result.delta.evidence.map((e) => e.id),
    observedAt: now,
    expiresAt: deadline,
    coverage: {
      ...result.batch.coverage,
      examined: 1000,
      emitted: 1000,
      total: 1000,
    },
  });
  await writeDataset(db, dataset, now);
  bridge = new NativeBridge(
    api.runtime.connectNative("ai.contextpilot.agent"),
    pairing,
    { codebase: true },
  );
  await bridge.publishProjection(result.read, {
    runtimeEpoch: 1,
    documentId: frame.documentId,
    deadline,
    signal: stop.signal,
    current: () => collector.isCurrent(),
    permissions: {
      graph: true,
      samples: false,
      datasets: [{ id: dataset.id, digest: dataset.digest }],
    },
  });
  return {
    revision: 1,
    privacy: true,
    coverage: result.batch.coverage,
  };
}
export function current() {
  return collector.isCurrent();
}
export function close() {
  bridge.close();
  collector.dispose();
}
