import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadS27 } from "./bundle.mjs";

// Development examples, not an independent holdout or an activation gate.
const variants = [
  [
    "intent-read",
    "aggregation",
    "intent",
    "READ",
    "Classify deterministic grouping and counting of existing data without page changes as READ. Reserve ANALYSIS for interpretation beyond deterministic computation.",
  ],
  [
    "intent-analysis",
    "analysis",
    "intent",
    "ANALYSIS",
    "Classify deterministic grouping and counting of existing data without page changes as READ. Reserve ANALYSIS for interpretation beyond deterministic computation.",
  ],
  [
    "semantic-filter",
    "analysis",
    "semantic_selection",
    "FILTER_CONTROL",
    "Identify the observed control that sets the requested date before data acquisition.",
  ],
  [
    "semantic-results",
    "aggregation",
    "semantic_selection",
    "RESULT_COLLECTION",
    "Identify the observed collection containing the current alarm results to be read.",
  ],
  [
    "processor-interpret",
    "analysis",
    "processor",
    "GPT_ANALYSIS",
    "Choose the processor for interpreting acquired evidence to explain supported patterns, not for data acquisition.",
  ],
  [
    "processor-aggregate",
    "aggregation",
    "processor",
    "RUNTIME",
    "Choose the processor for deterministic grouping and counting of existing data, not for interpretation.",
  ],
  [
    "recovery-stop",
    "search",
    "recovery",
    "STOP",
    "A prior mutation has unknown outcome. No safe authorized read-only observation is available; stop without repeating it.",
  ],
  [
    "recovery-inspect",
    "search",
    "recovery",
    "INSPECT",
    "A prior mutation has unknown outcome. A safe authorized read-only receipt observation is available and can resolve it; inspect without repeating it.",
  ],
];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const corpusBytes = await readFile("docs/baselines/s27/holdout.json");
const corpus = JSON.parse(corpusBytes);
const { module: s27, protocolSourceDigest } = await loadS27();
const key = process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY;
if (!key) throw new Error("CONTROLLER_CREDENTIAL_UNAVAILABLE");
const reportPath =
  process.env.S27_EXPLORATION_REPORT ?? "/tmp/s27-clarified-exploration.json";
const report = {
  schema: "s27-clarified-exploration/v1",
  at: new Date().toISOString(),
  scope:
    "Development examples; not an independent holdout or activation qualification",
  model: corpus.model,
  corpusHash: hash(corpusBytes),
  protocolSourceDigest,
  scriptDigest: hash(await readFile(import.meta.filename)),
  results: [],
};
for (const [id, scenario, phase, expected, instruction] of variants) {
  const example = corpus.cases.find(
    (c) =>
      c.scenario === scenario && c.language === "en" && c.order === "forward",
  );
  const frame = s27.scenarioFrame(example, phase, new s27.DecisionBudget());
  const request = s27.nativeRequest(frame);
  request.questions.decision.instructions = `${instruction} Select only a supplied ID. UNKNOWN, NEED_INPUT and UNSUPPORTED are valid. A selection is a proposal, not an approval or dispatch.`;
  if (phase === "intent")
    request.questions.decision.criteria.READ =
      "Read or deterministically group/count existing data without changing page state";
  const requestDigest = hash(JSON.stringify(request));
  const timer = AbortSignal.timeout(10000);
  let result;
  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(request),
      credentials: "omit",
      redirect: "error",
      signal: timer,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`CONTROLLER_HTTP_${response.status}`);
    }
    const parsed = s27.parseNativeResponse(
      await s27.readNativeJson(response.body, timer, 65536),
      request.questions,
      corpus.model,
    );
    const choice = parsed.answers.decision;
    result = {
      id,
      phase,
      expected,
      selected: choice.choice,
      matched: choice.choice === expected,
      confidence: choice.confidence,
      evidenceSufficiency: parsed.answers.evidence_sufficient.noul,
    };
  } catch (error) {
    result = {
      id,
      phase,
      expected,
      matched: false,
      error:
        error instanceof Error && /^CONTROLLER_HTTP_\d+$/.test(error.message)
          ? error.message
          : "CONTROLLER_REQUEST_FAILED",
    };
  }
  report.results.push({ ...result, requestDigest });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`${id}: ${result.matched ? "MATCH" : "NO_MATCH"}`);
}
console.log(
  `Development examples: ${report.results.filter((r) => r.matched).length}/${variants.length} matches; ${reportPath}`,
);
if (report.results.some((result) => !result.matched)) process.exitCode = 1;
