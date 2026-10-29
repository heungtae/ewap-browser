import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { loadS27 } from "./bundle.mjs";
import { phases } from "./multiphase-vocabulary.mjs";
import { referenceCase, referencePhase } from "./reference-phases.mjs";
import { alternateSource, expectedArguments } from "./reference-fixture.mjs";
const hash = (data) => createHash("sha256").update(data).digest("hex");
const bytes = await readFile("docs/baselines/s27/holdout.json");
const corpusHash = hash(bytes);
if (
  corpusHash !==
  "88b2a25e4a5fd5bac4cd2523cc09fd5e1cdb7c4ef37641b7e3d258b318742570"
)
  throw new Error("REFERENCE_CORPUS_CHANGED");
const corpus = JSON.parse(bytes),
  { module: s27, protocolSourceDigest } = await loadS27();
const key = process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY;
if (!key) throw new Error("CONTROLLER_CREDENTIAL_UNAVAILABLE");
const path =
  process.env.S27_REFERENCE_PHASES_REPORT ?? "/tmp/s27-reference-phases.json";
const report = {
  schema: "s27-reference-phases/v1",
  at: new Date().toISOString(),
  corpusHash,
  protocolSourceDigest,
  runnerDigest: hash(await readFile(import.meta.filename)),
  fixtureDigest: hash(await readFile("scripts/s27/reference-phases.mjs")),
  bindingDigest: hash(await readFile("scripts/s27/reference-fixture.mjs")),
  phaseListDigest: hash(
    await readFile("scripts/s27/multiphase-vocabulary.mjs"),
  ),
  model: corpus.model,
  templateVersion: "controller-v2",
  scope:
    "eight live decisions with shared task context and budget; hypothetical phase observations, no browser dispatch or user approval",
  http: [],
  results: [],
  gptControllerCalls: 0,
  browserDispatches: 0,
  approvalFacts: 0,
};
let activeFrame, capturePromise;
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
    const frame = activeFrame,
      contentType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();
    if (response.ok && contentType === "application/json" && frame) {
      const copy = response.clone();
      capturePromise = (async () => {
        const request = s27.nativeRequest(frame);
        if (
          typeof options.body !== "string" ||
          s27.digest(JSON.parse(options.body)) !== s27.digest(request)
        )
          throw new Error("REQUEST_CAPTURE_MISMATCH");
        const body = await s27.readNativeJson(
          copy.body,
          AbortSignal.timeout(10000),
          frame.budgets.responseByteLimit,
        );
        s27.parseNativeResponse(body, request.questions, report.model);
        if (JSON.stringify(body).includes(key))
          throw new Error("SECRET_IN_RESPONSE");
        return { contentType, body, bodyDigest: s27.digest(body) };
      })().catch(() => ({ error: "NATIVE_CAPTURE_FAILED" }));
    }
    return response;
  },
);
for (const item of corpus.cases) {
  const c = referenceCase(item),
    binding = s27.scenarioBindings(c),
    budget = new s27.DecisionBudget();
  const controller = new s27.DecisionController(
    adapter,
    budget,
    () => binding.context.current,
  );
  const prior = [],
    observations = [];
  for (const phase of phases) {
    const { frame, expected } = referencePhase(s27, c, phase, budget, prior);
    activeFrame = frame;
    capturePromise = undefined;
    const offset = report.http.length,
      outcome = await controller.evaluate(frame);
    const capture = capturePromise ? await capturePromise : null;
    const nativeResponse = capture && !("error" in capture) ? capture : null;
    const captureError =
      capture && "error" in capture
        ? capture.error
        : capture
          ? null
          : "NATIVE_CAPTURE_UNAVAILABLE";
    const selected = frame.candidateSet.candidates.find(
      (value) => value.id === outcome.decision?.selection,
    );
    const fragment = selected
      ? s27.bindFragment(selected, binding.sources, binding.context)
      : undefined;
    const expectedValues =
        phase === "next_tool" ? expectedArguments(item.scenario) : {},
      argumentsByName = {};
    for (const [name, expectedValue] of Object.entries(expectedValues)) {
      const value = fragment?.arguments.get(name),
        alternate = alternateSource(s27, name, binding);
      const alternative = s27.bindArgument(
        alternate.sources.get(name),
        alternate.context,
      );
      const denied = selected
        ? s27.bindFragment(selected, alternate.sources, alternate.context)
        : undefined;
      const deniedValue = denied?.arguments.get(name);
      argumentsByName[name] = {
        status: value?.status ?? null,
        valueMatched:
          value?.status === "BOUND" &&
          s27.digest(value.value) === s27.digest(expectedValue),
        sourceDigest: value?.status === "BOUND" ? value.sourceDigest : null,
        alternateValid: alternative.status === "BOUND",
        alternateRejected: denied?.status === "NEED_INPUT",
        alternateReason:
          deniedValue?.status === "NEED_INPUT" ? deniedValue.reason : null,
      };
    }
    const argumentsValid = Object.values(argumentsByName).every(
      (value) =>
        value.status === "BOUND" &&
        value.valueMatched &&
        value.alternateValid &&
        value.alternateRejected &&
        value.alternateReason === "ARGUMENT_SOURCE_CHANGED",
    );
    const matched =
      nativeResponse !== null &&
      outcome.outcome === "SELECTED" &&
      outcome.decision?.selection === expected &&
      fragment?.status === "BOUND" &&
      argumentsValid;
    observations.push({
      phase,
      expected,
      frame,
      requestDigest: s27.digest(s27.nativeRequest(frame)),
      httpStatus:
        report.http.length === offset + 1 ? report.http[offset] : null,
      nativeResponse,
      captureError,
      validatedResult: outcome.decision?.result ?? null,
      outcome: outcome.outcome,
      selection: outcome.decision?.selection ?? null,
      reason: outcome.reason ?? null,
      binding:
        phase === "next_tool" ? (fragment?.status ?? null) : "NOT_APPLICABLE",
      argumentsByName,
      matched,
      counters: outcome.counters,
    });
    prior.push({ phase, selection: outcome.decision?.selection ?? null });
  }
  report.results.push({
    id: item.id,
    language: item.language,
    scenario: item.scenario,
    order: item.order,
    observations,
    passed: observations.every((value) => value.matched),
  });
  await writeFile(path, JSON.stringify(report, null, 2) + "\n");
  console.log(
    `${item.id}: ${observations.filter((value) => value.matched).length}/${phases.length}`,
  );
}
console.log(
  `Reference phase cases: ${report.results.filter((item) => item.passed).length}/${corpus.cases.length}`,
);
if (report.results.some((item) => !item.passed)) process.exitCode = 1;
