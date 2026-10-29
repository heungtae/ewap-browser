import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadS27 } from "./bundle.mjs";
import { expectedSelections, selectionMatches } from "./score-selection.mjs";

const bytes = await readFile("docs/baselines/s27-v2/holdout.json");
const corpusHash = createHash("sha256").update(bytes).digest("hex");
if (
  corpusHash !==
  "c764598f841b0fc26218300a09e03f265c40a47deda017ed4209208d5870a861"
)
  throw new Error("V2_HOLDOUT_CHANGED_AFTER_FREEZE");
const corpus = JSON.parse(bytes);
const { module: s27, protocolSourceDigest } = await loadS27();
const key = process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY;
if (!key) throw new Error("CONTROLLER_CREDENTIAL_UNAVAILABLE");
const path = process.env.S27_V2_REPORT ?? "/tmp/s27-v2-live.json";
const adapter = new s27.NativeJevController({
  endpoint: "https://api.typesafe.ai/v1/systemone",
  model: corpus.model,
  modelRevision: 1,
  apiKey: key,
  enabled: true,
});
const report = {
  schema: "s27-v2-evaluation/v1",
  at: new Date().toISOString(),
  corpusHash,
  protocolSourceDigest,
  runnerDigest: createHash("sha256")
    .update(await readFile(import.meta.filename))
    .digest("hex"),
  model: corpus.model,
  templateVersion: corpus.templateVersion,
  scope:
    "new synthetic examples; no browser dispatch, approval or production qualification",
  results: [],
};
for (const [index, item] of corpus.cases.entries()) {
  const c = {
    ...item,
    taskId: `evaluation-${String(index + 1).padStart(3, "0")}`,
    order: "forward",
    mode: item.scenario === "aggregation" ? "ask" : "act",
    admittedAt: "2026-10-19T03:00:00Z",
    timezone: "Asia/Seoul",
  };
  const original = s27.scenarioFrame(c, item.phase, new s27.DecisionBudget());
  const { digest: _digest, ...payload } = original;
  const facts = payload.facts.filter((fact) => fact.id !== "previous_dispatch");
  if (item.fact) facts.push({ id: "current_step", value: item.fact });
  const frame = s27.createFrame({
    ...payload,
    templateVersion: corpus.templateVersion,
    facts,
  });
  let entry;
  try {
    const result = await adapter.evaluate(frame);
    const accepted = s27.acceptResult(frame, result);
    const choice = result.answers.decision;
    const expected = expectedSelections(item.expected);
    entry = {
      id: item.id,
      phase: item.phase,
      expected,
      nativeSelection: choice.choice,
      nativeMatch: selectionMatches(item.expected, choice.choice),
      gatedSelection: accepted.selection,
      gatedMatch: selectionMatches(item.expected, accepted.selection),
      reason: accepted.reason ?? null,
      confidence: choice.confidence,
      selectedProbability: choice.probabilities[choice.choice],
      evidenceSufficiency: result.answers.evidence_sufficient.noul,
    };
  } catch (error) {
    entry = {
      id: item.id,
      phase: item.phase,
      nativeMatch: false,
      gatedMatch: false,
      error:
        error instanceof Error && /^CONTROLLER_[A-Z0-9_]+$/.test(error.message)
          ? error.message
          : "CONTROLLER_EVALUATION_FAILED",
    };
  }
  report.results.push(entry);
  await writeFile(path, JSON.stringify(report, null, 2) + "\n");
  console.log(
    `${item.id}: native=${entry.nativeMatch ? "MATCH" : "NO_MATCH"} gated=${entry.gatedMatch ? "MATCH" : "NO_MATCH"}`,
  );
}
console.log(
  `v2 native ${report.results.filter((x) => x.nativeMatch).length}/${corpus.cases.length}; gated ${report.results.filter((x) => x.gatedMatch).length}/${corpus.cases.length}; ${path}`,
);
if (report.results.some((x) => !x.nativeMatch || !x.gatedMatch))
  process.exitCode = 1;
