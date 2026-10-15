import { acceptedChoice } from "../providers/jev-response.js";
import { safeDecisionState } from "../providers/decision-state.js";
import type {
  DecisionTask,
  ModelRequestOptions,
} from "../providers/jev-types.js";
import type { ProviderRuntime } from "../providers/runtime.js";
import type { ChatEventPayload } from "../contracts/chat-events.js";
import type { AgentPreferences } from "../policy/permission-mode.js";
import { assertRequestActive, type RequestContext } from "./request-context.js";
import { requestSourceConsent } from "./source-consent.js";
export const modelDecision = async (opts: {
  provider: ProviderRuntime;
  context?: RequestContext | undefined;
  runId?: string | undefined;
  publish?(id: string, event: ChatEventPayload): void;
  preferences?: (() => AgentPreferences) | undefined;
  task: DecisionTask;
  protectedData?: boolean;
  signal?: AbortSignal;
}) => {
  const { provider, context, runId } = opts;
  if (!context || !provider.bindings) return undefined;
  assertRequestActive(context);
  const binding = await provider.bindings.get(context.signal);
  provider.bindings.check(binding);
  if (!binding.decision || binding.failed) return undefined;
  const task = { ...opts.task, state: safeDecisionState(opts.task.state) };
  // Oversized packets require primary investigation; never silently truncate evidence.
  if (JSON.stringify(task).length > 30_000) return undefined;
  if (opts.protectedData) {
    if (!runId || !opts.publish) return undefined;
    const consentKey = `${context.documentEpoch ?? ""}:${context.generation ?? 0}`;
    if (!binding.consent.has(consentKey)) {
      const allowed = await requestSourceConsent({
        runId,
        category: "source_disclosure",
        ...(opts.preferences ? { preferences: opts.preferences() } : {}),
        signal: opts.signal ?? context.signal,
        current: () =>
          !context.signal.aborted && !binding.controller.signal.aborted,
        record: (event) => opts.publish!(runId, event),
        publish: (requestId) =>
          opts.publish!(runId, {
            type: "source_consent_required",
            request_id: requestId,
            resource_count: 1,
            purpose: "jev-decision",
            host: new URL(binding.decision!.base_url).host,
          }),
      });
      assertRequestActive(context);
      provider.bindings.check(binding);
      if (!allowed) return undefined;
      binding.consent.add(consentKey);
    }
  }
  const options: ModelRequestOptions = {
    signal: opts.signal ?? context.signal,
    bindingSignal: context.signal,
    onProgress: () => context.progress?.("PROVIDER_BODY"),
    ...(runId && opts.publish
      ? {
          onRole: (event) =>
            opts.publish!(runId, { type: "provider_activity", ...event }),
        }
      : {}),
  };
  const result = await provider.decide(task, options);
  assertRequestActive(context);
  if (result && task.questions.verdict && !acceptedChoice(result, "verdict")) {
    options.onRole?.({
      provider_role: "primary",
      stage: "DELEGATING",
      phase: task.phase,
    });
    return undefined;
  }
  return result;
};
