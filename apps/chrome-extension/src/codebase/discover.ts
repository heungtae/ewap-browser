import { buildGraph } from "@contextpilot/codebase-builder";
import {
  CodebaseReadService,
  type CodebaseRepository,
} from "@contextpilot/codebase-repository";
import {
  canonical,
  type Batch,
  type Context,
  type Entity,
} from "@contextpilot/codebase-schema";
export interface DiscoveryAdmission {
  batchId: string;
  deadline: number;
  context: Context;
  expectedRevision: number;
  readAllowed: boolean;
  scope: "visible_only" | "all_dom";
  signal: AbortSignal;
}
export interface CollectorPort {
  collect(admission: DiscoveryAdmission): Promise<Batch>;
}
export async function discover(
  admission: DiscoveryAdmission,
  collector: CollectorPort,
  repository: CodebaseRepository,
  current: () => Context,
  prior: Entity[] = [],
) {
  if (
    !Number.isSafeInteger(admission.deadline) ||
    admission.deadline > Date.now() + 600000
  )
    throw new Error("DEADLINE_INVALID");
  if (Date.now() >= admission.deadline) throw new Error("BUDGET_EXHAUSTED");
  if (!admission.readAllowed) throw new Error("DISCOVERY_SCOPE_DENIED");
  const fresh = () =>
    !admission.signal.aborted &&
    Date.now() < admission.deadline &&
    canonical(current()) === canonical(admission.context);
  if (!fresh()) throw new Error("BINDING_STALE");
  const batch = await collector.collect(admission);
  if (
    canonical(batch.context) !== canonical(admission.context) ||
    batch.expectedRevision !== admission.expectedRevision ||
    batch.batchId !== admission.batchId
  )
    throw new Error("COLLECTOR_CONTEXT_MISMATCH");
  const delta = await buildGraph(batch, prior);
  if (!fresh()) throw new Error("LATE_DELTA");
  const committed = await repository.commit(delta, fresh);
  return {
    batch,
    delta,
    committed,
    read: new CodebaseReadService(
      repository,
      admission.context.partitionId,
      admission.context.pageKey,
      fresh,
    ),
  };
}
