import { ProviderRuntime } from "../../../src/providers/runtime.js";
import { CoreProviderTransport } from "../../../src/providers/transport.js";
import type { ProviderConfig } from "../../../src/providers/types.js";
import type { DecisionTask } from "../../../src/providers/jev-types.js";
export const primary: ProviderConfig = {
  plugin_id: "legacy.identity",
  plugin_version: "1.2.3",
  label: "primary",
  base_url: "https://primary.example/v1",
  wire_api: "chat_completions",
  model: "fixture",
  api_key: "fixture-primary-secret",
  api_key_header: "authorization_bearer",
  headers: [{ name: "x-fixture", value: "fixture-header-secret" }],
  timeout_ms: 1000,
  enabled: true,
};
export const jev: ProviderConfig = {
  ...primary,
  kind: "typesafe_jev",
  plugin_id: "contextpilot.typesafe-jev",
  label: "decision",
  base_url: "https://decision.example/v1",
  model: "jev-1.13.0",
  api_key: "fixture-decision-secret",
  headers: [],
};
export const task: DecisionTask = {
  phase: "intent",
  state: { original_request: "Inspect" },
  questions: {
    verdict: {
      type: "choice",
      instructions: "Select intent",
      criteria: { read: "Read", action: "Action" },
    },
  },
};
export const nativeResponse = (
  questions: DecisionTask["questions"],
  choices: Record<string, string> = {},
) => ({
  model: "jev-1.13.0",
  usage: { input_tokens: 12, output_tokens: 3 },
  answers: Object.fromEntries(
    Object.entries(questions).map(([id, q]) => {
      if (q.type === "noul") return [id, { type: "noul", noul: 0.99 }];
      if (q.type === "score")
        return [
          id,
          {
            type: "score",
            score: 0,
            confidence: 1,
            legend: Object.fromEntries(
              q.criteria.map((v, i) => [String(i), v]),
            ),
            probabilities: Object.fromEntries(
              q.criteria.map((_v, i) => [String(i), i === 0 ? 1 : 0]),
            ),
          },
        ];
      const keys = Object.keys(q.criteria),
        chosen = choices[id] ?? keys[0]!;
      return [
        id,
        {
          type: "choice",
          choice: chosen,
          confidence: 1,
          probabilities: Object.fromEntries(
            keys.map((k) => [k, k === chosen ? 1 : 0]),
          ),
        },
      ];
    }),
  ),
});
export const setup = (fetcher?: typeof fetch, initial?: unknown) => {
  let state: unknown = initial;
  const area = {
    async get() {
      return { provider_settings: state };
    },
    async set(value: Record<string, unknown>) {
      state = structuredClone(value.provider_settings);
    },
  };
  return {
    runtime: new ProviderRuntime(area, new CoreProviderTransport(fetcher)),
    state: () => state,
    replace: (value: unknown) => {
      state = value;
    },
  };
};
export const dual = async (runtime: ProviderRuntime, failure = "primary") => {
  await runtime.handle("PROVIDER_SAVE", { id: "primary", config: primary });
  await runtime.handle("PROVIDER_SAVE", { id: "decision", config: jev });
  await runtime.handle("PROVIDER_SET_ROUTING", {
    revision: (await runtime.handle("PROVIDER_LIST", undefined)).revision,
    routing: {
      mode: "jev",
      decision_provider: "decision",
      pre_dispatch_failure: failure,
    },
  });
};
export const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
