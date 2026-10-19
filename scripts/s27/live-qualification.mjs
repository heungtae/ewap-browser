import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadS27 } from "./bundle.mjs";
const corpusPath = "docs/baselines/s27/holdout.json";
const expectedCorpusHash =
  "88b2a25e4a5fd5bac4cd2523cc09fd5e1cdb7c4ef37641b7e3d258b318742570";
const bytes = await readFile(corpusPath);
const corpusHash = createHash("sha256").update(bytes).digest("hex");
if (corpusHash !== expectedCorpusHash)
  throw new Error("HOLDOUT_CHANGED_AFTER_FREEZE");
const corpus = JSON.parse(bytes);
const key = process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY;
const reportPath = process.env.S27_REPORT ?? "/tmp/s27-live-qualification.json";
const { module: s27, protocolSourceDigest } = await loadS27();
const endpoint = "https://api.typesafe.ai/v1/systemone";
const report = {
  schema: "s27-qualification/v1",
  protocolSourceDigest,
  attemptPurpose:
    "Current source verification; frozen expectations and 0.9 gates unchanged. Earlier failed attempts retained separately.",
  at: new Date().toISOString(),
  model: corpus.model,
  endpoint,
  protocol: corpus.protocol,
  templateVersion: corpus.templateVersion,
  corpusHash,
  scope:
    "Live native JEV decisions over synthetic graphs; no Chrome dispatch, actual GPT analyst, MCP or OS qualification",
  result: "UNVERIFIED",
  results: [],
  http: [],
  firstFailure: null,
  gptControllerCalls: 0,
  approvalFacts: 0,
  browserDispatches: 0,
};
if (!key) {
  report.firstFailure = "CONTROLLER_CREDENTIAL_UNAVAILABLE";
} else {
  const fetcher = async (url, request) => {
    if (url !== endpoint) throw new Error("UNEXPECTED_CONTROLLER_DESTINATION");
    const response = await fetch(url, request);
    report.http.push({ status: response.status });
    return response;
  };
  const adapter = new s27.NativeJevController(
    {
      endpoint,
      model: corpus.model,
      modelRevision: 1,
      apiKey: key,
      enabled: true,
    },
    fetcher,
  );
  for (const c of corpus.cases) {
    const result = await s27.evaluateScenario(c, adapter);
    report.results.push(result);
    if (!result.passed)
      report.firstFailure ??= {
        caseId: c.id,
        phases: result.results
          .filter((r) => !r.matched)
          .map(({ phase, outcome, reason, selection, expected }) => ({
            phase,
            outcome,
            reason,
            selection,
            expected,
          })),
      };
    // Keep all first attempts; a failed semantic gate is never repaired by retuning or hidden retries.
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
    console.log(`${c.id}: ${result.passed ? "PASS" : "FAIL"}`);
  }
  report.result =
    report.results.length === corpus.cases.length &&
    report.results.every((r) => r.passed)
      ? "PASS"
      : "FEASIBILITY_FAILED";
}
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    result: report.result,
    cases: report.results.length,
    calls: report.http.length,
    firstFailure: report.firstFailure,
    reportPath,
  }),
);
process.exitCode = report.result === "PASS" ? 0 : 1;
