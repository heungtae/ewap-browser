import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { loadS27 } from "./bundle.mjs";
import {
  alternateSource,
  expectedArguments,
  referenceFrame,
} from "./reference-fixture.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const bytes = await readFile("docs/baselines/s27/holdout.json");
const corpusHash = hash(bytes);
if (
  corpusHash !==
  "88b2a25e4a5fd5bac4cd2523cc09fd5e1cdb7c4ef37641b7e3d258b318742570"
)
  throw new Error("REFERENCE_CORPUS_CHANGED");
const corpus = JSON.parse(bytes);
const { module: s27, protocolSourceDigest } = await loadS27();
const key = process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY;
if (!key) throw new Error("CONTROLLER_CREDENTIAL_UNAVAILABLE");
const path = process.env.S27_REFERENCE_REPORT ?? "/tmp/s27-reference.json";
const report = {
  schema: "s27-reference-v2/v1",
  at: new Date().toISOString(),
  corpusHash,
  protocolSourceDigest,
  runnerDigest: hash(await readFile(import.meta.filename)),
  fixtureDigest: hash(await readFile("scripts/s27/reference-fixture.mjs")),
  model: corpus.model,
  templateVersion: "controller-v2",
  scope:
    "reference next-step selection and bound arguments only; no browser dispatch or approval",
  gptControllerCalls: 0,
  browserDispatches: 0,
  approvalFacts: 0,
  http: [],
  results: [],
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
    const frame = activeFrame;
    const contentType = response.headers
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
  const budget = new s27.DecisionBudget();
  const { frame, binding } = referenceFrame(s27, item, budget);
  activeFrame = frame;
  capturePromise = undefined;
  const offset = report.http.length;
  const outcome = await new s27.DecisionController(
    adapter,
    budget,
    () => binding.context.current,
  ).evaluate(frame);
  const captured = capturePromise ? await capturePromise : null;
  const nativeResponse = captured && !("error" in captured) ? captured : null;
  const candidate = frame.candidateSet.candidates.find(
    (c) => c.id === outcome.decision?.selection,
  );
  const fragment = candidate
    ? s27.bindFragment(candidate, binding.sources, binding.context)
    : undefined;
  const expected = expectedArguments(item.scenario),
    argumentsByName = {};
  for (const [name, expectedValue] of Object.entries(expected)) {
    const value = fragment?.arguments.get(name);
    const alternate = alternateSource(s27, name, binding);
    const validAlternate = s27.bindArgument(
      alternate.sources.get(name),
      alternate.context,
    );
    const rejected = candidate
      ? s27.bindFragment(candidate, alternate.sources, alternate.context)
      : undefined;
    const alternateValue = rejected?.arguments.get(name);
    argumentsByName[name] = {
      status: value?.status ?? null,
      valueMatched:
        value?.status === "BOUND" &&
        s27.digest(value.value) === s27.digest(expectedValue),
      sourceDigest: value?.status === "BOUND" ? value.sourceDigest : null,
      alternateValid: validAlternate.status === "BOUND",
      alternateRejected: rejected?.status === "NEED_INPUT",
      alternateReason:
        alternateValue?.status === "NEED_INPUT" ? alternateValue.reason : null,
    };
  }
  const passed =
    nativeResponse !== null &&
    outcome.outcome === "SELECTED" &&
    outcome.decision?.selection === item.expected.next_tool &&
    fragment?.status === "BOUND" &&
    Object.values(argumentsByName).every(
      (value) =>
        value.status === "BOUND" &&
        value.valueMatched &&
        value.alternateValid &&
        value.alternateRejected &&
        value.alternateReason === "ARGUMENT_SOURCE_CHANGED",
    );
  report.results.push({
    id: item.id,
    language: item.language,
    scenario: item.scenario,
    order: item.order,
    frame,
    requestDigest: s27.digest(s27.nativeRequest(frame)),
    httpStatus: report.http.length === offset + 1 ? report.http[offset] : null,
    nativeResponse,
    validatedResult: outcome.decision?.result ?? null,
    outcome: outcome.outcome,
    selection: outcome.decision?.selection ?? null,
    reason: outcome.reason ?? null,
    argumentsByName,
    passed,
    counters: outcome.counters,
  });
  await writeFile(path, JSON.stringify(report, null, 2) + "\n");
  console.log(`${item.id}: ${passed ? "PASS" : "FAIL"}`);
}
console.log(
  `Reference next steps: ${report.results.filter((item) => item.passed).length}/${corpus.cases.length}`,
);
if (report.results.some((item) => !item.passed)) process.exitCode = 1;
