import { withDeadline } from "../security/deadline.js";
import { assertRequestActive } from "./request-context.js";
import type { ActStepDependencies } from "./act-step-dependencies.js";
import type { ActSession } from "./act-session-types.js";
import type {
  ProviderMessage,
  ProviderToolDefinition,
} from "../providers/types.js";

export const assessmentChat = async (
  dependencies: ActStepDependencies,
  session: ActSession,
  messages: ProviderMessage[],
  tools: ProviderToolDefinition[],
  deadline: number,
) => {
  assertRequestActive(session.requestContext);
  const controller = new AbortController();
  const abort = () => controller.abort();
  session.requestContext?.signal.addEventListener("abort", abort, {
    once: true,
  });
  const timer = setTimeout(abort, Math.max(0, deadline - Date.now()));
  try {
    const response = await withDeadline(
      dependencies.provider.chat(
        { messages, tools },
        {
          signal: controller.signal,
          onProgress: () => session.requestContext?.progress?.("PROVIDER_BODY"),
        },
      ),
      Math.max(0, deadline - Date.now()),
      "REQUEST_TIMEOUT",
    );
    assertRequestActive(session.requestContext);
    return response;
  } finally {
    clearTimeout(timer);
    session.requestContext?.signal.removeEventListener("abort", abort);
  }
};
