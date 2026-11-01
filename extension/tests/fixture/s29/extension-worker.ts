import {
  ChromeCollector,
  type CollectorChrome,
  type FrameBinding,
} from "../../../../apps/chrome-extension/src/codebase/chrome-collector.js";
import {
  discover,
  type DiscoveryAdmission,
} from "../../../../apps/chrome-extension/src/codebase/discover.js";
import { identifyContext } from "../../../../packages/codebase-builder/src/index.js";
import {
  openDatabase,
  type CodebaseReadService,
  CodebaseRepository,
} from "../../../../packages/codebase-repository/src/index.js";
import type {
  Context,
  Entity,
} from "../../../../packages/codebase-schema/src/index.js";
const api = (globalThis as typeof globalThis & { chrome: CollectorChrome })
  .chrome;
let repository: CodebaseRepository, binding: FrameBinding, current: Context;
let prior: Entity[] = [];
let tab: number;
let collector: ChromeCollector;
let lastRead: CodebaseReadService;
export async function setup(tabId: number) {
  tab = tabId;
  const frame = await api.webNavigation.getFrame({ tabId, frameId: 0 });
  if (!frame) throw Error("FRAME_ABSENT");
  binding = frame;
  collector = new ChromeCollector(api, binding);
  current = await identifyContext({
    taskId: "task_extension_fixture",
    profile: "extension_fixture",
    url: binding.url,
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
  repository = new CodebaseRepository(
    await openDatabase(indexedDB, current.profileGuard),
    current.profileGuard,
  );
  return true;
}
function admission(revision: number): DiscoveryAdmission {
  current = {
    ...current,
    source: { ...current.source, sequence: revision, sourceRevision: revision },
  };
  return {
    batchId: `batch_extension_${revision}`,
    context: current,
    deadline: Date.now() + 10000,
    expectedRevision: revision - 1,
    readAllowed: true,
    scope: "all_dom",
    signal: new AbortController().signal,
  };
}
export async function runRevision(revision: number) {
  const value = admission(revision);
  const port = collector;
  if (revision === 1) {
    try {
      await port.collect({ ...value, readAllowed: false });
      throw Error("CONSENT_BYPASSED");
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "DISCOVERY_SCOPE_DENIED"
      )
        throw error;
    }
  }
  const result = await discover(value, port, repository, () => current, prior);
  lastRead = result.read;
  const snapshot = await repository.snapshot(
    current.partitionId,
    current.pageKey,
  );
  if (
    snapshot.revision !== revision ||
    JSON.stringify(result.delta).includes("NEVER_STORE")
  )
    throw Error("REVISION_OR_PRIVACY");
  const found = await result.read.search({ name: "Save", revision, limit: 10 });
  const reused = prior
    .filter((e) => e.kind === "control" && e.name === "Save")
    .map((e) => e.id);
  prior = result.delta.entities;
  return {
    revision,
    savedRevision: snapshot.revision,
    coverage: result.batch.coverage,
    privacy: true,
    saveMatches: found.entities.length,
    identityReused:
      revision === 2 ? found.entities.some((e) => reused.includes(e.id)) : null,
    extensionIndexedDb: true,
  };
}
export async function requestForNegative() {
  const value = admission(1);
  return {
    kind: "wca.codebase.collect",
    requestId: crypto.randomUUID(),
    url: binding.url,
    batchId: value.batchId,
    context: current,
    expectedRevision: 0,
    scope: value.scope,
    deadline: Date.now() + 10000,
  };
}
export async function rejectOldDocument() {
  try {
    await lastRead.catalog();
    throw Error("OLD_READ_ACCEPTED");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "PROJECTION_STALE")
      throw error;
  }
  try {
    await new ChromeCollector(api, binding).collect(admission(4));
    throw Error("OLD_DOCUMENT_ACCEPTED");
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "BINDING_STALE")
      throw error;
  }
  const snapshot = await repository.snapshot(
    current.partitionId,
    current.pageKey,
  );
  if (snapshot.revision !== 3) throw Error("STALE_COMMIT");
  return {
    oldDocumentRejected: true,
    oldReadRejected: true,
    committedRevision: 3,
    tabIdMatches: current.source.tabId === tab,
  };
}
