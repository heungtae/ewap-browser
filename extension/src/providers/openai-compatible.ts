import { fail } from "../security/validation.js";
import type {
  NormalizedProviderRequest,
  ProviderAdapter,
  ProviderRequestPlan,
} from "./types.js";

const forbidden = new Set([
  "url",
  "headers",
  "api_key",
  "selector",
  "coordinates",
  "cdp_method",
  "execution_path",
]);
export const assertSafeRequestPlan = (plan: ProviderRequestPlan): void => {
  if (
    !["/chat/completions", "/responses"].includes(plan.path) ||
    Object.keys(plan.body).some((key) => forbidden.has(key))
  )
    fail("PROVIDER_PLUGIN_FAILED");
};

export const openAiCompatibleAdapter: ProviderAdapter = {
  id: "webbrain.openai-compatible",
  plan(request: NormalizedProviderRequest): ProviderRequestPlan {
    const plan: ProviderRequestPlan =
      request.wire_api === "chat_completions"
        ? {
            path: "/chat/completions",
            body: {
              model: request.model,
              messages: request.messages,
              stream: request.stream,
            },
          }
        : {
            path: "/responses",
            body: {
              model: request.model,
              input: request.messages,
              stream: request.stream,
            },
          };
    assertSafeRequestPlan(plan);
    return plan;
  },
};
