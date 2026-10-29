import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { loadS27 } from "./bundle.mjs";
import { checkChangedSource } from "./binding-negative.mjs";

const hash = (data) => createHash("sha256").update(data).digest("hex");
const corpusBytes = await readFile(
  "docs/baselines/s27-independent/corpus.json",
);
const corpusHash = hash(corpusBytes);
if (
  corpusHash !==
  "654eec4155c043c89c3e5c9646c773055c92c4e08b63d53d8f1fd685d2c029fc"
)
  throw new Error("INDEPENDENT_CORPUS_CHANGED");
const corpus = JSON.parse(corpusBytes);
const { module: s27, protocolSourceDigest } = await loadS27();
const key = process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY;
if (!key) throw new Error("CONTROLLER_CREDENTIAL_UNAVAILABLE");
const path = process.env.S27_BINDING_REPORT ?? "/tmp/s27-binding.json";
const report = {
  schema: "s27-independent-binding/v1",
  at: new Date().toISOString(),
  corpusHash,
  protocolSourceDigest,
  runnerDigest: hash(await readFile(import.meta.filename)),
  negativeHelperDigest: hash(
    await readFile("scripts/s27/binding-negative.mjs"),
  ),
  model: "jev-1.13.0",
  templateVersion: "controller-v2",
  scope: "synthetic tool selection and binding; no browser or approval",
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
const cases = corpus.cases.filter((item) => item.category === "action");
for (const [index, item] of cases.entries()) {
  const context = {
    taskId: `binding-${String(index + 1).padStart(3, "0")}`,
    taskRevision: 1,
    planRevision: 1,
    graphRevision: 1,
    evidenceRevision: 1,
    capabilityRevision: 1,
    cancellationGeneration: 0,
    mode: "act",
    scopeId: "fixture-page",
  };
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
  const bindingContext = {
    current: context,
    request: item.request,
    sensitiveSpans: [],
    admittedAt: "2026-10-29T03:00:00Z",
    timezone: "Asia/Seoul",
    approved: new Map(),
    observed: new Map(),
  };
  const sources = new Map([["query", source]]);
  const initial = s27.bindArgument(source, bindingContext);
  if (initial.status !== "BOUND") throw new Error("HOLDOUT_BINDING_INVALID");
  const ids = ["read_table", "search_form", "explain_patterns"];
  const descriptions = [
    "Read the displayed table without submitting a search",
    "Fill the observed search field with the user-supplied identifier as the next step",
    "Explain patterns from data already acquired without a search",
  ];
  const candidates = ids.map((id, i) => ({
    candidate: {
      id,
      semanticId: id,
      description: descriptions[i],
      source: "registered",
      scopeId: context.scopeId,
      modes: ["act"],
      capabilityRefs: ["fixture"],
      evidenceRefs: ["observed-form"],
      unresolvedInputs: [],
      bindingDigests: i === 1 ? { query: initial.sourceDigest } : {},
      steps:
        i === 1
          ? [
              {
                id: "fill",
                tool: "web.fill",
                actionRef: "observed-field",
                dependencies: [],
                parameters: ["query"],
                effect: "local-ui",
                goalPredicateRefs: ["search-result"],
                preconditionRefs: ["fresh-form"],
              },
            ]
          : [],
    },
    policyPermitted: true,
    uniqueTarget: true,
    fresh: true,
    userMentionMatch: 0,
    workflowMatch: false,
    evidenceTime: 1,
    resolvedParameters: ["query"],
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
    phase: "next_tool",
    candidateSet: page,
    budgets: budget.snapshot(),
    facts: [
      { id: "user_request", value: item.request },
      {
        id: "observed",
        value:
          "A uniquely identified search form with an identifier field and submit control is present.",
      },
    ],
    stateComplete: true,
  });
  const outcome = await new s27.DecisionController(
    adapter,
    budget,
    () => context,
  ).evaluate(frame);
  const selected = page.candidates.find(
    (candidate) => candidate.id === outcome.decision?.selection,
  );
  const bound = selected
    ? s27.bindFragment(selected, sources, bindingContext)
    : undefined;
  const argument = bound?.arguments.get("query");
  const valid =
    outcome.outcome === "SELECTED" &&
    selected?.id === "search_form" &&
    bound?.status === "BOUND" &&
    argument?.status === "BOUND" &&
    argument.value === match[0];
  const negative = checkChangedSource(s27, selected, source, bindingContext);
  const passed = Boolean(
    valid &&
      negative.changedSourceValid &&
      negative.changedSourceRejected &&
      negative.changedSourceReason === "ARGUMENT_SOURCE_CHANGED",
  );
  report.results.push({
    id: item.id,
    language: item.language,
    order: index % 2 ? "reversed" : "forward",
    selection: selected?.id ?? null,
    outcome: outcome.outcome,
    binding: bound?.status ?? null,
    valueMatched: argument?.status === "BOUND" && argument.value === match[0],
    ...negative,
    passed,
    reason: outcome.reason ?? null,
  });
  await writeFile(path, JSON.stringify(report, null, 2) + "\n");
  console.log(`${item.id}: ${passed ? "PASS" : "FAIL"}`);
}
if (report.results.some((item) => !item.passed)) process.exitCode = 1;
