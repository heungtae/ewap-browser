import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename } from "node:path";
const [output, ...inputs] = process.argv.slice(2);
if (!output || !inputs.length)
  throw Error("Usage: collect-s20-evidence.mjs OUTPUT REPORT...");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const safeResult = (result) => {
  let value = result;
  if (typeof result.content === "string") {
    try {
      value = JSON.parse(
        result.content
          .replace(/^\[UNTRUSTED_TOOL_RESULT\]\n/, "")
          .replace(/\n\[\/UNTRUSTED_TOOL_RESULT\]$/, ""),
      );
    } catch {
      value = {};
    }
  }
  const coverage = value.coverage ?? {};
  return {
    id: result.id,
    hash: result.source_hash ?? digest(JSON.stringify(result)),
    status: value.status,
    code: value.code,
    coverage: Object.fromEntries(
      [
        "complete",
        "truncated",
        "collected_count",
        "supplied_count",
        "total_count",
        "reason",
        "eof_observed",
        "read_bytes",
        "total_bytes",
      ]
        .filter((key) => coverage[key] !== undefined)
        .map((key) => [key, coverage[key]]),
    ),
    source_read: value.source_read ?? typeof value.content?.text === "string",
    workflow_read: value.workflow_read ?? typeof value.source_text === "string",
    source_rule_observed: value.source_rule_observed,
    changed_data: value.changed_data,
    component_read: value.component_read,
    execution: value.execution,
    outcome: value.outcome,
    verifier: value.verifier,
    dispatched: value.dispatched,
  };
};
const runs = [];
for (const path of inputs) {
  const bytes = await readFile(path),
    report = JSON.parse(bytes);
  if (!Array.isArray(report))
    throw Error(`Expected case array: ${basename(path)}`);
  runs.push({
    artifact: path.replace(/^\/tmp\//, ""),
    sha256: digest(bytes),
    cases: report.map((c) => ({
      id: c.id,
      pass: c.pass,
      error: c.error,
      elapsed_ms: c.elapsed_ms,
      provider: c.provider,
      model: c.model,
      chrome: c.chrome,
      build_hash: c.build_hash,
      prompt_hash: c.prompt_hash,
      approvals: c.approvalCount,
      plan_review: c.planReviewObserved,
      plan_approvals: c.planApprovalCount,
      workflow_original_read: c.fullReviewObserved,
      zip: c.zip,
      diagnostic_zip_redacted: c.diagnosticZipRedacted,
      api_calls: c.api_calls,
      selected: c.selected,
      contracts: (Array.isArray(c.calls) ? c.calls : []).findLast(
        (turn) => turn.contracts,
      )?.contracts,
      returned_results: Object.fromEntries(
        (Array.isArray(c.calls) ? c.calls : []).flatMap((turn) =>
          (turn.returned ?? []).map((result) => [
            result.id,
            safeResult(result),
          ]),
        ),
      ),
      schema_sets: Object.fromEntries(
        (Array.isArray(c.calls) ? c.calls : []).map((turn) => [
          digest(JSON.stringify(turn.tools)),
          turn.tools,
        ]),
      ),
      turns: (Array.isArray(c.calls) ? c.calls : []).map((turn) => ({
        route: turn.intent_route,
        request_hash: turn.request_hash,
        upstream_status: turn.upstream_status ?? turn.upstreamStatus,
        upstream_ms: turn.upstream_ms ?? turn.upstreamElapsedMs,
        error: turn.error,
        schema_set: digest(JSON.stringify(turn.tools)),
        selected: turn.response ?? turn.responseTools,
        returned_ids: turn.returned?.map((result) => result.id),
        goal: turn.goalStatus,
        result_call_ids: turn.resultCallIds,
        response_call_ids: turn.responseCallIds,
        workflow_results: turn.workflowResults,
        workflow_reads: turn.workflowReads,
        workflow_read_complete: turn.workflowReadComplete,
        review: turn.reviewVerdict,
        proposals: turn.proposals,
        plans: turn.plans,
      })),
      fault_calls: typeof c.calls === "number" ? c.calls : undefined,
      fault_results: c.results,
      mutations: c.mutations,
    })),
  });
}
await writeFile(
  output,
  JSON.stringify(
    {
      scope:
        "Browser-local qualification; controlled and live runs remain separate",
      runs,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Recorded ${runs.length} runs without raw source, model text or credentials`,
);
