import {
  bindArgument,
  bindFragment,
  createFrame,
  digest,
  enumerateCandidates,
  DecisionBudget,
  DecisionController,
  type Phase,
  type ControllerPort,
} from "../../../packages/task-engine/src/decisions/index.js";
import {
  scenarioBindings,
  scenarioContext,
  type HoldoutCase,
} from "./s27-binding-context.js";
import { scenarioCandidates, idsByPhase } from "./s27-candidates.js";
export {
  scenarioBindings,
  scenarioContext,
  type HoldoutCase,
} from "./s27-binding-context.js";
export function scenarioFrame(
  c: HoldoutCase,
  phase: Phase,
  budget: DecisionBudget,
) {
  const bindings = scenarioBindings(c);
  const boundDigests = Object.fromEntries(
    [...bindings.sources].flatMap(([name, source]) => {
      const value = bindArgument(source, bindings.context);
      return value.status === "BOUND" ? [[name, value.sourceDigest]] : [];
    }),
  );
  const resolved = [...bindings.sources]
    .filter(
      ([_key, source]) =>
        bindArgument(source, bindings.context).status === "BOUND",
    )
    .map(([key]) => key);
  let page = enumerateCandidates(
    scenarioContext(c),
    scenarioCandidates(c, phase).map((candidate) => ({
      candidate: { ...candidate, bindingDigests: boundDigests },
      policyPermitted: true,
      uniqueTarget: true,
      fresh: true,
      userMentionMatch: 0,
      workflowMatch: false,
      evidenceTime: 1,
      resolvedParameters: resolved,
    })),
    new Set(["qualified-fixture"]),
  );
  if (c.order === "reversed") {
    const { id: _id, digest: _digest, ...payload } = page;
    payload.candidates.reverse();
    page = {
      ...payload,
      id: `set:${digest(payload)}`,
      digest: digest(payload),
    };
  }
  const facts = [
    { id: "user_request", value: c.request },
    {
      id: "observed",
      value:
        "Current alarms collection, uniquely identified equipment search form and date filter have registered relations to results.",
    },
    { id: "complete_authorized_dataset", value: true },
    {
      id: "goal_predicates_verified",
      value: phase === "result_acceptance" || phase === "evidence_sufficiency",
    },
    {
      id: "previous_dispatch",
      value:
        phase === "recovery"
          ? "unknown; recovery must never repeat it"
          : phase === "result_acceptance"
            ? "recorded receipt with independently verified goal predicates"
            : "not_dispatched; planning the next permitted step",
    },
    { id: "admitted_timezone", value: c.timezone },
  ];
  return createFrame({
    protocol: "wca.task/v1",
    templateVersion: "controller-v1",
    model: "jev-1.13.0",
    modelRevision: 1,
    context: scenarioContext(c),
    phase,
    candidateSet: page,
    budgets: budget.snapshot(),
    facts,
    stateComplete: true,
  });
}
export async function evaluateScenario(c: HoldoutCase, port: ControllerPort) {
  c = { ...c, taskId: `${c.id}:${crypto.randomUUID()}` };
  const budget = new DecisionBudget(),
    controller = new DecisionController(port, budget, () => scenarioContext(c));
  const results = [];
  for (const phase of Object.keys(idsByPhase) as Phase[]) {
    const frame = scenarioFrame(c, phase, budget),
      start = performance.now();
    const result = await controller.evaluate(frame);
    const selected = result.decision?.selection ?? null;
    const fragment = frame.candidateSet.candidates.find(
      (candidate) => candidate.id === selected,
    );
    const provenance = fragment
      ? bindFragment(
          fragment,
          scenarioBindings(c).sources,
          scenarioBindings(c).context,
        )
      : undefined;
    results.push({
      phase,
      frameDigest: frame.digest,
      candidateDigest: frame.candidateSet.digest,
      outcome: result.outcome,
      selection: selected,
      expected: c.expected[phase],
      matched:
        result.outcome === "SELECTED" &&
        selected === c.expected[phase] &&
        provenance?.status !== "NEED_INPUT",
      boundArguments: provenance
        ? [...provenance.arguments].map(([name, binding]) => ({
            name,
            status: binding.status,
            sourceDigest:
              binding.status === "BOUND" ? binding.sourceDigest : null,
            kind: binding.status === "BOUND" ? binding.binding.kind : null,
          }))
        : [],
      nativeSelection: result.decision?.result.answers.decision.choice ?? null,
      nativeConfidence:
        result.decision?.result.answers.decision.confidence ?? null,
      nativeProbabilities:
        result.decision?.result.answers.decision.probabilities ?? null,
      evidenceSufficiency:
        result.decision?.result.answers.evidence_sufficient.noul ?? null,
      counters: result.counters,
      firstFailure: result.firstFailure ?? null,
      reason: result.reason ?? null,
      latencyMs: Math.round(performance.now() - start),
    });
  }
  return {
    id: c.id,
    language: c.language,
    order: c.order,
    scenario: c.scenario,
    results,
    passed: results.every((result) => result.matched),
    counters: budget.snapshot(),
    gptControllerCalls: 0,
    approvalFacts: 0,
    browserDispatches: 0,
  };
}
