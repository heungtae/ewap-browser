import { makeDataset } from "../../../../../packages/codebase-repository/src/datasets.js";
import { digest } from "../../../../../packages/codebase-schema/src/digest.js";
import {
  resolveInput,
  groundedSummary,
  type AnalysisInput,
  type AnalysisRequest,
  type AnalysisResult,
  type DataPort,
} from "../../../../../packages/analysis-engine/src/index.js";
export const config = {
  endpoint: "https://analyst.fixture.test/v1/responses",
  model: "gpt-fixture-2026",
  revision: 1,
  enabled: true,
  stream: false,
};
export async function fixture() {
  let now = 10;
  const data = await makeDataset({
    schema: "wca.codebase/v1",
    kind: "dataset",
    id: "dataset_one",
    partitionId: "partition_one",
    pageKey: "page_one",
    graphRevision: 1,
    fields: [
      { name: "amount", type: "number", unit: "USD" },
      { name: "note", type: "string", unit: null },
    ],
    rows: [
      [10, "safe"],
      [20, "mail a@example.test token=private"],
    ],
    rowIds: ["row_one", "row_two"],
    coverage: {
      status: "complete",
      examined: 2,
      emitted: 2,
      omitted: 0,
      redactions: 0,
      total: 2,
      reasons: [],
      startedAt: 1,
      endedAt: 2,
      deadline: 100,
    },
    source: "static",
    evidenceIds: ["evidence_one"],
    observedAt: 1,
    expiresAt: 100,
  });
  const request: AnalysisRequest = {
    schema: "wca.analysis/v1",
    taskId: "task_one",
    attemptId: "attempt_one",
    partitionId: data.partitionId,
    taskRevision: 1,
    configDigest: await digest(config),
    objective: "Sum amounts",
    datasets: [
      {
        id: data.id,
        digest: data.digest,
        pageKey: data.pageKey,
        graphRevision: 1,
        fields: ["amount"],
      },
    ],
    criteria: [],
    maxBytes: 65536,
    deadline: 1000,
  };
  const port: DataPort = {
    read: async () => data,
    authorized: async () => true,
  };
  return {
    data,
    request,
    port,
    now: () => now,
    tick: (n: number) => {
      now += n;
    },
    input: () => resolveInput(request, port, () => now),
  };
}
export function result(input: AnalysisInput): AnalysisResult {
  const d = input.datasets[0]!;
  const findings: AnalysisResult["findings"] = [
    {
      datasetId: d.id,
      digest: d.digest,
      evidenceIds: d.evidenceIds,
      op: "sum",
      field: "amount",
      rowId: null,
      value: 30,
    },
  ];
  return {
    schema: "wca.analysis/v1",
    taskId: input.taskId,
    attemptId: input.attemptId,
    inputDigest: input.inputDigest,
    summary: groundedSummary(findings),
    findings,
    limitations: [],
    recommendations: [],
    additionalData: [],
  };
}

export const reply = (input: AnalysisInput) => ({
  result: result(input),
  usage: { inputTokens: 100, outputTokens: 200 },
});
