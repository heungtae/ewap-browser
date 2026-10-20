import {
  batchSchema,
  bytes,
  digest,
  type Batch,
  type Observation,
} from "../../../../../packages/codebase-schema/src/index.js";
import { identifyContext } from "../../../../../packages/codebase-builder/src/index.js";
export async function context(
  sequence = 1,
  url = "https://fixture.test/search?q=one",
  accountGuard: string | null = "account-a",
) {
  return identifyContext({
    taskId: "task_one",
    profile: "profile_one",
    url,
    accountGuard,
    source: {
      tabId: 1,
      frameId: 0,
      documentEpoch: 1,
      routeEpoch: 1,
      sourceRevision: sequence,
      sequence,
      cancellationGeneration: 0,
    },
  });
}
export function observation(patch: Partial<Observation> = {}): Observation {
  return {
    evidenceId: "ev_one",
    parentEvidenceId: null,
    sourceLocation: "a".repeat(64),
    role: "button",
    kind: null,
    name: "Save",
    stableKey: null,
    visible: true,
    enabled: true,
    editable: false,
    checked: null,
    selected: null,
    control: "button",
    inputType: null,
    required: false,
    min: null,
    max: null,
    step: null,
    pattern: null,
    options: [],
    routeKey: null,
    headers: [],
    sample: [],
    ...patch,
  };
}
export async function batch(
  records: Observation[] = [observation()],
  sequence = 1,
  expectedRevision = 0,
  patch: Partial<Batch> = {},
): Promise<Batch> {
  const body = {
    schema: "wca.codebase/v1" as const,
    batchId: `batch_${sequence}`,
    context: await context(sequence),
    expectedRevision,
    collectorVersion: "dom-v1" as const,
    budgetVersion: "construction-v1" as const,
    scope: "visible_only" as const,
    observedAt: 100,
    records: records.map((r) => ({
      ...r,
      evidenceId: `ev_${sequence}_${r.evidenceId}`,
      parentEvidenceId: r.parentEvidenceId
        ? `ev_${sequence}_${r.parentEvidenceId}`
        : null,
    })),
    coverage: {
      status: "complete" as const,
      examined: records.length,
      emitted: records.length,
      omitted: 0,
      redactions: 0,
      total: records.length,
      reasons: [],
      startedAt: 100,
      endedAt: 101,
      deadline: 10100,
    },
    ...patch,
  };
  const {
    digest: _digest,
    bytes: _bytes,
    ...clean
  } = body as typeof body & { digest?: string; bytes?: number };
  return batchSchema.parse({
    ...clean,
    digest: await digest(clean),
    bytes: bytes(clean),
  });
}
