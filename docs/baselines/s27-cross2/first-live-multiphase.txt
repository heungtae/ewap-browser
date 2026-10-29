import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { loadS27 } from "./bundle.mjs";
import { schedule } from "./multiphase-schedule.mjs";
import { makeBinding, makeContext, makeFrame } from "./multiphase-fixture.mjs";
import { changedSourceCheck } from "./multiphase-negative.mjs";

const hash = (data) => createHash("sha256").update(data).digest("hex");
const bytes = await readFile("docs/baselines/s27-cross2/corpus.json");
const corpusHash = hash(bytes);
if (
  corpusHash !==
  "5cf9326b047e59ca664c749150e5e97b9e3bd1e6408445e419055fda7cd5aa55"
)
  throw new Error("MULTIPHASE_CORPUS_CHANGED");
const corpus = JSON.parse(bytes);
const { module: s27, protocolSourceDigest } = await loadS27();
const key = process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY;
if (!key) throw new Error("CONTROLLER_CREDENTIAL_UNAVAILABLE");
const path = process.env.S27_MULTIPHASE_REPORT ?? "/tmp/s27-multiphase.json";
const report = {
  schema: "s27-cross/v2",
  at: new Date().toISOString(),
  corpusHash,
  protocolSourceDigest,
  runnerDigest: hash(await readFile(import.meta.filename)),
  fixtureDigest: hash(await readFile("scripts/s27/multiphase-fixture.mjs")),
  scheduleDigest: hash(await readFile("scripts/s27/multiphase-schedule.mjs")),
  negativeDigest: hash(await readFile("scripts/s27/multiphase-negative.mjs")),
  observationsDigest: hash(
    await readFile("scripts/s27/multiphase-observations.mjs"),
  ),
  vocabularyDigest: hash(
    await readFile("scripts/s27/multiphase-vocabulary.mjs"),
  ),
  model: "jev-1.13.0",
  templateVersion: "controller-v2",
  scope:
    "separate synthetic phase observations; no browser dispatch, approval or complete task execution",
  http: [],
  results: [],
  gptControllerCalls: 0,
  browserDispatches: 0,
  approvalFacts: 0,
};
let activeFrame;
let capturePromise;
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
    const frameForCall = activeFrame;
    const contentType = response.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase();
    if (response.ok && contentType === "application/json" && frameForCall) {
      const copy = response.clone();
      capturePromise = (async () => {
        const request = s27.nativeRequest(frameForCall);
        if (
          typeof options.body !== "string" ||
          s27.digest(JSON.parse(options.body)) !== s27.digest(request)
        )
          throw new Error("REQUEST_CAPTURE_MISMATCH");
        const body = await s27.readNativeJson(
          copy.body,
          AbortSignal.timeout(10000),
          frameForCall.budgets.responseByteLimit,
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
for (const [index, item] of corpus.cases.entries()) {
  const observations = [];
  for (const { phase, condition } of schedule()) {
    const context = makeContext(item, phase, condition);
    const binding = makeBinding(s27, item, context);
    const budget = new s27.DecisionBudget();
    const controller = new s27.DecisionController(
      adapter,
      budget,
      () => context,
    );
    const { frame, expected } = makeFrame(
      s27,
      item,
      index,
      context,
      budget,
      phase,
      binding,
      condition,
    );
    activeFrame = frame;
    capturePromise = undefined;
    const callOffset = report.http.length;
    const outcome = await controller.evaluate(frame);
    const capture = capturePromise ? await capturePromise : null;
    const nativeResponse = capture && !("error" in capture) ? capture : null;
    const captureError =
      capture && "error" in capture
        ? capture.error
        : capture
          ? null
          : "NATIVE_CAPTURE_UNAVAILABLE";
    const httpStatus =
      report.http.length === callOffset + 1 ? report.http[callOffset] : null;
    const selected = frame.candidateSet.candidates.find(
      (c) => c.id === outcome.decision?.selection,
    );
    const fragment = selected
      ? s27.bindFragment(selected, binding.sources, binding.bindingContext)
      : undefined;
    const argumentName =
      phase === "next_tool"
        ? item.category === "action"
          ? "query"
          : item.category === "analysis"
            ? "dataset"
            : null
        : null;
    const argument = argumentName
      ? fragment?.arguments.get(argumentName)
      : undefined;
    const argumentMatched = argumentName
      ? argument?.status === "BOUND" && argument.value === binding.expectedValue
      : null;
    const hasArguments = selected?.steps.some((step) => step.parameters.length);
    const negative = changedSourceCheck(s27, selected, binding, argumentName);
    const negativePassed =
      !argumentName ||
      (negative?.sourceValid &&
        negative.rejected &&
        negative.reason === "ARGUMENT_SOURCE_CHANGED");
    observations.push({
      phase,
      condition,
      expected,
      selection: outcome.decision?.selection ?? null,
      nativeSelection: outcome.decision?.result.answers.decision.choice ?? null,
      outcome: outcome.outcome,
      reason: outcome.reason ?? null,
      httpStatus,
      nativeResponse,
      captureError,
      validatedResult: outcome.decision?.result ?? null,
      binding: hasArguments
        ? (fragment?.status ?? "MISSING")
        : "NOT_APPLICABLE",
      argumentName,
      argumentMatched,
      negative,
      matched:
        nativeResponse !== null &&
        outcome.outcome === "SELECTED" &&
        outcome.decision?.selection === expected &&
        fragment?.status === "BOUND" &&
        (!argumentName || argumentMatched) &&
        negativePassed,
      frame,
      requestDigest: s27.digest(s27.nativeRequest(frame)),
      counters: outcome.counters,
    });
  }
  report.results.push({
    id: item.id,
    language: item.language,
    results: observations,
    passed: observations.every((value) => value.matched),
  });
  await writeFile(path, JSON.stringify(report, null, 2) + "\n");
  console.log(
    `${item.id}: ${observations.filter((value) => value.matched).length}/${observations.length}`,
  );
}
console.log(
  `Complete synthetic cases: ${report.results.filter((item) => item.passed).length}/${corpus.cases.length}`,
);
if (report.results.some((item) => !item.passed)) process.exitCode = 1;
