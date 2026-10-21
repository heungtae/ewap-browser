import { writeFile } from "node:fs/promises";
import {
  AnalysisEngine,
  MemoryAnalysisBudget,
} from "../../dist/s34/engine.mjs";
import { ResponsesAnalyst } from "../../dist/s34/responses.mjs";
import { makeDataset, digest } from "../../dist/s34/fixtures.mjs";
const provider = process.env.S34_PROVIDER ?? "openrouter";
const config = {
  endpoint:
    provider === "openai"
      ? "https://api.openai.com/v1/responses"
      : "https://openrouter.ai/api/v1/responses",
  model:
    process.env.S34_MODEL ??
    (provider === "openai" ? "gpt-6-luna" : "openai/gpt-4.1-mini"),
  revision: 1,
  enabled: true,
  stream: false,
};
const reportPath = process.env.S34_REPORT ?? "/tmp/s34-live.json";
const key =
  provider === "openai"
    ? process.env.OPENAI_API_KEY
    : process.env.OPENROUTER_API_KEY;
const report = {
  schema: "s34-live/v1",
  at: new Date().toISOString(),
  provider,
  model: config.model,
  endpoint: config.endpoint,
  result: "UNVERIFIED",
  firstFailure: null,
  scope:
    "Live Responses transport and grounded synthetic aggregation only; no Chrome, JEV/controller, user UI/consent or release qualification",
  browserDispatches: 0,
  approvals: 0,
  browserSchemas: 0,
  results: [],
  http: [],
};
if (!key) report.firstFailure = "ANALYSIS_CREDENTIAL_UNAVAILABLE";
else
  for (const [index, values] of [
    [0, [11, 17]],
    [1, [-4, 9, 15]],
  ]) {
    const started = Date.now();
    const expected = values.reduce((a, b) => a + b, 0);
    const data = await makeDataset({
      schema: "wca.codebase/v1",
      kind: "dataset",
      id: "dataset_one",
      partitionId: "partition_one",
      pageKey: "page_one",
      graphRevision: 1,
      fields: [{ name: "amount", type: "number", unit: null }],
      rows: values.map((v) => [v]),
      rowIds: values.map((_v, i) => `row_${i}`),
      coverage: {
        status: "complete",
        examined: values.length,
        emitted: values.length,
        omitted: 0,
        redactions: 0,
        total: values.length,
        reasons: [],
        startedAt: started,
        endedAt: started,
        deadline: started + 30000,
      },
      source: "static",
      evidenceIds: ["evidence_one"],
      observedAt: started,
      expiresAt: started + 60000,
    });
    const request = {
      schema: "wca.analysis/v1",
      taskId: `task_${index}`,
      attemptId: "attempt_one",
      partitionId: data.partitionId,
      taskRevision: 1,
      configDigest: await digest(config),
      objective:
        "Return exactly one sum finding for field amount in dataset_one. Use supplied taskId, attemptId and inputDigest. Use original dataset digest and evidence IDs. No other findings or additional data. Summary must follow the required exact format.",
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
      deadline: started + 30000,
    };
    const fetcher = async (url, init) => {
      if (url !== config.endpoint) throw new Error("ANALYSIS_DESTINATION");
      const body = JSON.parse(init.body);
      if (body.tools || body.previous_response_id || body.store !== false)
        throw new Error("ANALYSIS_AUTHORITY");
      const response = await fetch(url, init);
      report.http.push({ status: response.status });
      return response;
    };
    const engine = new AnalysisEngine({
      data: { read: async () => data, authorized: async () => true },
      analyst: new ResponsesAnalyst(config, async () => key, fetcher),
      budget: new MemoryAnalysisBudget(request.taskId),
      current: () => true,
      now: Date.now,
    });
    const outcome = await engine.run(request);
    const passed =
      outcome.status === "SUPPORTED" &&
      outcome.result.findings.length === 1 &&
      outcome.result.findings[0].op === "sum" &&
      outcome.result.findings[0].value === expected;
    const record = {
      id: `holdout_${index}`,
      passed,
      status: outcome.status,
      code: outcome.code ?? null,
      expected,
      outputDigest: outcome.result ? await digest(outcome.result) : null,
      elapsedMs: Date.now() - started,
    };
    report.results.push(record);
    if (!passed)
      report.firstFailure ??= record.code ?? "ANALYSIS_SEMANTIC_FAILURE";
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(record));
    if (!passed) break;
  }
report.result =
  report.results.length === 2 && report.results.every((r) => r.passed)
    ? "PASS"
    : "UNVERIFIED";
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    result: report.result,
    firstFailure: report.firstFailure,
    calls: report.http.length,
    reportPath,
  }),
);
