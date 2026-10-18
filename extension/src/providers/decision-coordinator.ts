import { traceDecision } from "../diagnostics/method-trace.js";
import { developmentDiagnostics } from "../diagnostics/privacy-mode.js";
import { digestCanonical, opaqueId } from "../security/canonical.js";
import { ContractError, fail } from "../security/validation.js";
import { evaluateJev } from "./jev-client.js";
import { acceptedChoice } from "./jev-response.js";
import type {
  DecisionTask,
  JevJudgment,
  ModelRequestOptions,
} from "./jev-types.js";
import type { ModelBindings } from "./model-bindings.js";
import type { CoreProviderTransport } from "./transport.js";
export const decide = async (
  bindings: ModelBindings,
  transport: CoreProviderTransport,
  task: DecisionTask,
  options: ModelRequestOptions,
): Promise<JevJudgment | undefined> => {
  const signal = options.bindingSignal ?? options.signal;
  if (!signal) return undefined;
  const binding = await bindings.get(signal);
  bindings.check(binding);
  options.signal?.throwIfAborted();
  if (!binding.decision || binding.failed) return undefined;
  const fingerprint = digestCanonical(task);
  if (binding.decisions >= 24 || binding.fingerprints.has(fingerprint))
    return fail("REQUEST_TIMEOUT");
  binding.fingerprints.add(fingerprint);
  binding.decisions++;
  options.onRole?.({
    provider_role: "decision",
    stage: task.phase === "result_acceptance" ? "REVIEWING" : "DECIDING",
    phase: task.phase,
  });
  const controller = new AbortController();
  const abort = () => controller.abort();
  const signals = [
    binding.controller.signal,
    ...(options.signal ? [options.signal] : []),
  ];
  for (const source of signals) {
    source.addEventListener("abort", abort, { once: true });
    if (source.aborted) abort();
  }
  const started = Date.now();
  const decisionId = opaqueId();
  traceDecision(`model.decision.requested:${decisionId}`, {
    ...(developmentDiagnostics() ? { request: task } : {}),
    decision_id: decisionId,
    provider_id: binding.decision.plugin_id,
    model: binding.decision.model,
    phase: task.phase,
    request_digest: fingerprint,
    state_keys: Object.keys(task.state),
    question_keys: Object.keys(task.questions),
  });
  try {
    const response = await evaluateJev(
      transport,
      {
        ...binding.decision,
        timeout_ms: Math.min(binding.decision.timeout_ms, 10_000),
      },
      task,
      controller.signal,
    );
    bindings.check(binding);
    options.signal?.throwIfAborted();
    traceDecision(`model.decision.responded:${decisionId}`, {
      ...(developmentDiagnostics() ? { response } : {}),
      provider_role: "decision",
      phase: task.phase,
      template_version: 1,
      decision_id: decisionId,
      model_version: response.model,
      elapsed_ms: Date.now() - started,
      question_count: Object.keys(task.questions).length,
      usage: response.usage,
      answers: Object.fromEntries(
        Object.entries(response.answers).map(([key, answer]) => [
          key,
          answer.type === "choice"
            ? {
                type: answer.type,
                choice: answer.choice,
                confidence: answer.confidence,
              }
            : answer.type === "score"
              ? {
                  type: answer.type,
                  score: answer.score,
                  confidence: answer.confidence,
                }
              : { type: answer.type, noul: answer.noul },
        ]),
      ),
      calls: binding.decisions,
      settings_revision: binding.revision,
    });
    options.onProgress?.();
    const sufficiency = response.answers.evidence_sufficient;
    if (
      task.questions.evidence_sufficient &&
      (sufficiency?.type !== "noul" || sufficiency.noul < 0.9)
    ) {
      traceDecision(`model.decision.handled:${decisionId}`, {
        decision_id: decisionId,
        outcome: "delegated_to_primary",
        reason: "evidence_insufficient",
      });
      options.onRole?.({
        provider_role: "primary",
        stage: "DELEGATING",
        phase: task.phase,
      });
      return undefined;
    }
    if (
      task.questions.processor &&
      acceptedChoice(response, "processor", 0.8) !== "JEV_DECISION"
    ) {
      traceDecision(`model.decision.handled:${decisionId}`, {
        decision_id: decisionId,
        outcome: "delegated_to_primary",
        reason: "primary_processor_selected_or_uncertain",
      });
      options.onRole?.({
        provider_role: "primary",
        stage: "DELEGATING",
        phase: task.phase,
      });
      return undefined;
    }
    traceDecision(`model.decision.handled:${decisionId}`, {
      decision_id: decisionId,
      outcome: "decision_accepted",
      phase: task.phase,
    });
    return {
      source: "jev",
      phase: task.phase,
      decision_id: decisionId,
      answers: response.answers,
    };
  } catch (error) {
    bindings.check(binding);
    options.signal?.throwIfAborted();
    if (
      error instanceof ContractError &&
      [
        "POLICY_DENIED",
        "PERMISSION_REQUIRED",
        "PAGE_SCOPE_STALE",
        "INVALID_ARGUMENT",
      ].includes(error.code)
    )
      throw error;
    if (
      error instanceof ContractError &&
      error.detail === "local provider host permission is required"
    )
      throw error;
    // Preserve the first failure; never replay a dispatched mutation.
    binding.failed = true;
    binding.mutationStopped = binding.dispatched;
    const status =
      error instanceof ContractError
        ? /^HTTP (\d{3})\b/.exec(error.detail ?? "")?.[1]
        : undefined;
    traceDecision(`model.decision.failed:${decisionId}`, {
      provider_role: "decision",
      phase: task.phase,
      decision_id: decisionId,
      settings_revision: binding.revision,
      elapsed_ms: Date.now() - started,
      code:
        error instanceof ContractError ? error.code : "PROVIDER_UNAVAILABLE",
      ...(status ? { http_status: Number(status) } : {}),
    });
    options.onRole?.({
      provider_role: "decision",
      stage:
        !binding.dispatched && binding.routing.pre_dispatch_failure === "stop"
          ? "STOPPED"
          : "FALLBACK",
      phase: task.phase,
      code:
        error instanceof ContractError ? error.code : "PROVIDER_UNAVAILABLE",
    });
    if (!binding.dispatched && binding.routing.pre_dispatch_failure === "stop")
      return fail(
        "PROVIDER_UNAVAILABLE",
        "decision failure; configured stop policy",
      );
    return undefined;
  } finally {
    for (const source of signals) source.removeEventListener("abort", abort);
  }
};
