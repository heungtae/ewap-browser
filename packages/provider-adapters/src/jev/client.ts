import {
  acceptResult,
  nativeRequest,
  type ControllerPort,
  type DecisionFrame,
  type DecisionResult,
} from "@contextpilot/task-engine/decisions";
import { parseNativeResponse } from "./native-response.js";
import { readNativeJson } from "./read-native-json.js";
export type JevConfiguration = {
  endpoint: string;
  model: string;
  modelRevision: number;
  apiKey: string;
  enabled: boolean;
};
export class NativeJevController implements ControllerPort {
  private readonly configuration: Readonly<JevConfiguration>;
  public constructor(
    configuration: JevConfiguration,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    const url = new URL(configuration.endpoint);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^jev-\d+\.\d+\.\d+$/.test(configuration.model) ||
      !Number.isSafeInteger(configuration.modelRevision) ||
      configuration.modelRevision < 0 ||
      /[\r\n]/.test(configuration.apiKey)
    )
      throw new Error("INVALID_JEV_CONFIGURATION");
    this.configuration = Object.freeze({ ...configuration });
  }
  public async evaluate(
    frame: DecisionFrame,
    signal?: AbortSignal,
  ): Promise<DecisionResult> {
    const config = this.configuration;
    if (!config.enabled || !config.apiKey)
      throw new Error("CONTROLLER_DISABLED");
    if (
      frame.model !== config.model ||
      frame.modelRevision !== config.modelRevision
    )
      throw new Error("WRONG_MODEL_REVISION");
    if (frame.budgets.responseByteLimit < 1)
      throw new Error("CONTROLLER_BUDGET_EXHAUSTED");
    const request = nativeRequest(frame),
      serialized = JSON.stringify(request);
    if (serialized.includes(config.apiKey))
      throw new Error("SECRET_IN_DECISION_FRAME");
    const deadline = new AbortController();
    const abort = () => deadline.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, 10000);
    try {
      let response: Response;
      try {
        response = await this.fetcher(config.endpoint, {
          method: "POST",
          body: serialized,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.apiKey}`,
          },
          credentials: "omit",
          redirect: "error",
          signal: deadline.signal,
        });
      } catch {
        throw new Error(
          deadline.signal.aborted
            ? "CONTROLLER_TIMEOUT"
            : "CONTROLLER_TRANSPORT_FAILED",
        );
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error(`CONTROLLER_HTTP_${response.status}`);
      }
      if (
        !response.headers
          .get("content-type")
          ?.split(";", 1)[0]
          ?.trim()
          .match(/^application\/json$/i)
      ) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error("INVALID_NATIVE_CONTENT_TYPE");
      }
      const parsed = parseNativeResponse(
        await readNativeJson(
          response.body,
          deadline.signal,
          frame.budgets.responseByteLimit,
        ),
        request.questions,
        config.model,
      );
      // Correlation is attached by this adapter to the original native request; it is not a provider-echo claim or invented tool-call ID.
      const result = {
        protocol: "wca.task/v1" as const,
        frameDigest: frame.digest,
        candidateDigest: frame.candidateSet.digest,
        templateVersion: frame.templateVersion,
        model: parsed.model,
        modelRevision: config.modelRevision,
        context: frame.context,
        answers: parsed.answers,
        usage: parsed.usage,
      };
      return acceptResult(frame, result).result;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
}
