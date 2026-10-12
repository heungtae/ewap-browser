import { consumeAssessment } from "./act-assessment-budget.js";
import { actExecutionInventory } from "./act-execution-inventory.js";
import { opaqueId } from "../security/canonical.js";
import { ContractError } from "../security/validation.js";
import { goalCheckTool } from "./act-plan-schema.js";
import type {
  ProviderChatResponse,
  ProviderMessage,
} from "../providers/types.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import type { ActSession } from "./act-session-types.js";
import type { Run } from "../state/run-coordinator.js";
import type { ActivePage } from "./page-context-runtime.js";

/** No mutation, plan, scroll or consent-expanding tool is offered on retry. */
export const reassessGoal = async (opts: {
  dependencies: ActStepDependencies;
  session: ActSession;
  run: Run;
  observation: ActivePage;
  messages: ProviderMessage[];
  response: ProviderChatResponse;
  deadline: number;
  check(): void;
}) => {
  const { dependencies, session, run } = opts;
  opts.check();
  const assessmentDeadline = Math.min(
    opts.deadline,
    consumeAssessment(session, "goal"),
  );
  const observationId = opaqueId();
  const model = dependencies.coordinator.modelSnapshot(
    run.id,
    opts.observation.snapshot,
  );
  const refs = model.snapshot.nodes.map((node) => node.model_ref);
  const allowedRefs = model.snapshot.nodes
    .filter((node) => node.visible && node.completion_digest)
    .map((node) => node.model_ref);
  const call = opts.response.tool_calls[0];
  if (call)
    opts.messages.push(
      {
        role: "assistant",
        content: opts.response.content,
        tool_calls: opts.response.tool_calls,
      },
      {
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify({
          status: "OBSERVATION_CHANGED",
          observation_id: observationId,
          hint: "The preceding report was discarded. Reassess the original goal from the NEW observation. Do not repeat actions.",
        }),
      },
    );
  opts.messages.push({
    role: "user",
    content: `[UNTRUSTED_PAGE_PROJECTION]\n${dependencies.serialise(model.snapshot)}\n[/UNTRUSTED_PAGE_PROJECTION]\nCurrent observation_id: ${observationId}. Only report_goal_status is available; action results remain unchanged. You MUST call report_goal_status, even for unknown or incomplete. A plain-text answer does not confirm the goal. Use the original request and current typed execution outcome; For a page-method calculation/query, approved returned data can establish the data-only goal without any UI change while action UNKNOWN remains unchanged. Missing business-effect evidence is not missing calculation data; do not claim server persistence. For other mutations, accepted structured confirmations may resolve historical raw unknown local UI results.`,
  });
  opts.messages.push({
    role: "user",
    content: `[UNTRUSTED_EXECUTION_INVENTORY]\n${JSON.stringify(actExecutionInventory({ session, observationId, requestRevision: session.requestContext?.generation ?? session.harnessCapabilities?.request_revision ?? 1, documentEpoch: opts.observation.snapshot.document_epoch, actionTools: [], readTools: [] }))}\n[/UNTRUSTED_EXECUTION_INVENTORY]`,
  });
  const controller = new AbortController();
  const abort = () => controller.abort();
  session.requestContext?.signal.addEventListener("abort", abort, {
    once: true,
  });
  const timer = setTimeout(abort, Math.max(0, assessmentDeadline - Date.now()));
  try {
    const response = await Promise.race([
      dependencies.provider.chat(
        {
          messages: opts.messages,
          tools: [goalCheckTool(observationId, allowedRefs)],
        },
        {
          signal: controller.signal,
          onProgress: () => session.requestContext?.progress?.("PROVIDER_BODY"),
        },
      ),
      new Promise<never>((_resolve, reject) =>
        controller.signal.addEventListener(
          "abort",
          () => reject(new ContractError("REQUEST_TIMEOUT")),
          { once: true },
        ),
      ),
    ]);
    opts.check();
    return { response, refs, observationId };
  } finally {
    clearTimeout(timer);
    session.requestContext?.signal.removeEventListener("abort", abort);
  }
};
