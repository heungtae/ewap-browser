import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { loadS27 } from "./bundle.mjs";

const bytes = await readFile("docs/baselines/s27-independent/corpus.json");
const hash = createHash("sha256").update(bytes).digest("hex");
if (hash !== "654eec4155c043c89c3e5c9646c773055c92c4e08b63d53d8f1fd685d2c029fc")
  throw new Error("INDEPENDENT_CORPUS_CHANGED");
const corpus = JSON.parse(bytes);
const { module: s27, protocolSourceDigest } = await loadS27();
const key = process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY;
if (!key) throw new Error("CONTROLLER_CREDENTIAL_UNAVAILABLE");
const path =
  process.env.S27_INDEPENDENT_REPORT ?? "/tmp/s27-independent-live.json";
const report = {
  schema: "s27-independent-intent/v1",
  at: new Date().toISOString(),
  corpusHash: hash,
  protocolSourceDigest,
  runnerDigest: createHash("sha256")
    .update(await readFile(import.meta.filename))
    .digest("hex"),
  model: "jev-1.13.0",
  templateVersion: "controller-v2",
  scope:
    "separately authored synthetic intent cases; no browser dispatch, approval or complete task execution",
  http: [],
  results: [],
};
const adapter = new s27.NativeJevController(
  {
    endpoint: "https://api.typesafe.ai/v1/systemone",
    model: report.model,
    modelRevision: 1,
    apiKey: key,
    enabled: true,
  },
  async (url, options) => {
    const response = await fetch(url, options);
    report.http.push(response.status);
    return response;
  },
);
const descriptions = {
  READ: "Read existing data or compute deterministic counts without changing the page.",
  ACTION:
    "Modify a page form using the user's exact identifier and submit the requested search.",
  ANALYSIS:
    "Interpret already acquired data to explain evidence-supported patterns.",
};
for (const [index, item] of corpus.cases.entries()) {
  const context = {
    taskId: `trial-${String(index + 1).padStart(3, "0")}`,
    taskRevision: 1,
    planRevision: 1,
    graphRevision: 1,
    evidenceRevision: 1,
    capabilityRevision: 1,
    cancellationGeneration: 0,
    mode: "act",
    scopeId: "fixture-page",
  };
  const candidates = Object.entries(descriptions).map(([id, description]) => ({
    candidate: {
      id,
      semanticId: id,
      meaning: id,
      description,
      source: "registered",
      scopeId: context.scopeId,
      modes: ["ask", "act"],
      capabilityRefs: ["fixture"],
      evidenceRefs: ["observation"],
      unresolvedInputs: [],
      bindingDigests: {},
      steps: [],
    },
    policyPermitted: true,
    uniqueTarget: true,
    fresh: true,
    userMentionMatch: 0,
    workflowMatch: false,
    evidenceTime: 1,
  }));
  let page = s27.enumerateCandidates(context, candidates, new Set(["fixture"]));
  if (index % 2) {
    const { id: _id, digest: _digest, ...payload } = page;
    payload.candidates.reverse();
    page = {
      ...payload,
      id: `set:${s27.digest(payload)}`,
      digest: s27.digest(payload),
    };
  }
  const budget = new s27.DecisionBudget();
  const frame = s27.createFrame({
    protocol: "wca.task/v1",
    templateVersion: report.templateVersion,
    model: report.model,
    modelRevision: 1,
    context,
    phase: "intent",
    candidateSet: page,
    budgets: budget.snapshot(),
    facts: [{ id: "user_request", value: item.request }],
    stateComplete: true,
  });
  const expected = { read: "READ", action: "ACTION", analysis: "ANALYSIS" }[
    item.category
  ];
  let binding = null;
  if (item.category === "action") {
    const match = item.request.match(/\b(?:SKU|ORD|APT)-\d{3}\b/);
    if (!match || match.index === undefined)
      throw new Error("HOLDOUT_IDENTIFIER_MISSING");
    const source = {
      kind: "user_span",
      start: match.index,
      end: match.index + match[0].length,
      spanDigest: s27.digest(match[0]),
      valueType: "string",
      unit: null,
    };
    const bound = s27.bindArgument(source, {
      current: context,
      request: item.request,
      sensitiveSpans: [],
      admittedAt: "2026-10-29T03:00:00Z",
      timezone: "Asia/Seoul",
      approved: new Map(),
      observed: new Map(),
    });
    binding = {
      status: bound.status,
      matches: bound.status === "BOUND" && bound.value === match[0],
    };
  }
  const outcome = await new s27.DecisionController(
    adapter,
    budget,
    () => context,
  ).evaluate(frame);
  const selection = outcome.decision?.result.answers.decision.choice ?? null;
  const matched =
    selection === expected &&
    outcome.outcome === "SELECTED" &&
    (binding === null || binding.matches);
  report.results.push({
    id: item.id,
    language: item.language,
    order: index % 2 ? "reversed" : "forward",
    expected,
    selection,
    outcome: outcome.outcome,
    matched,
    binding,
    reason: outcome.reason ?? null,
  });
  await writeFile(path, JSON.stringify(report, null, 2) + "\n");
  console.log(`${item.id}: ${matched ? "PASS" : "FAIL"}`);
}
console.log(
  `Independent intent ${report.results.filter((r) => r.matched).length}/${corpus.cases.length}; ${path}`,
);
if (report.results.some((item) => !item.matched)) process.exitCode = 1;
