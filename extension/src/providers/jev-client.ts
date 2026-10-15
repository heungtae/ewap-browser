import { validateJevTask } from "./jev-task-validation.js";
import { fail } from "../security/validation.js";
import { readNativeJson } from "./native-json-body.js";
import { parseJevResponse } from "./jev-response.js";
import type { DecisionTask } from "./jev-types.js";
import type { ProviderConfig } from "./types.js";
import type { CoreProviderTransport } from "./transport.js";
export const evaluateJev = async (
  transport: CoreProviderTransport,
  config: ProviderConfig,
  task: DecisionTask,
  signal?: AbortSignal,
) => {
  validateJevTask(task);
  if (config.kind !== "typesafe_jev") return fail("INVALID_ARGUMENT");
  const result = await transport.sendNative(
    config,
    { model: config.model, state: task.state, questions: task.questions },
    signal,
  );
  try {
    return parseJevResponse(
      await readNativeJson(result.body, result.signal),
      task.questions,
      config.model,
    );
  } finally {
    result.release();
  }
};
