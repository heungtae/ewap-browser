import { fail, isPlainObject } from "../security/validation.js";
import type { ProviderSettings } from "../settings/provider-settings.js";
import {
  handleProviderLifecycle,
  lifecycleKinds,
} from "./provider-lifecycle.js";
import { resolveOpenAiCompatible } from "./resolve-openai-compatible.js";
import { testProvider } from "./provider-test.js";
import { evaluateJev } from "./jev-client.js";
import { acceptedChoice } from "./jev-response.js";
import type { CoreProviderTransport } from "./transport.js";
export const handleManagement = async (
  kind: string,
  payload: unknown,
  settings: ProviderSettings,
  transport: CoreProviderTransport,
): Promise<Record<string, unknown>> => {
  if (kind === "PROVIDER_LIST")
    return {
      ok: true,
      ...(await settings.publicState()),
    };
  if (kind === "PROVIDER_EXPORT")
    return { ok: true, export: await settings.exportPublic() };
  const value = isPlainObject(payload) ? payload : fail("INVALID_ARGUMENT");
  if (kind === "PROVIDER_SET_ROUTING") {
    if (
      Object.keys(value).some((k) => !["routing", "revision"].includes(k)) ||
      !Number.isSafeInteger(value.revision)
    )
      return fail("INVALID_ARGUMENT");
    await settings.setRouting(value.routing, Number(value.revision));
    return { ok: true, ...(await settings.management()) };
  }
  if (lifecycleKinds.has(kind)) {
    const result = await handleProviderLifecycle(kind, payload, settings);
    return result;
  }
  if (typeof value.id !== "string") return fail("INVALID_ARGUMENT");
  const id = value.id;
  if (kind === "PROVIDER_SAVE") {
    if (
      Object.keys(value).some(
        (k) => !["id", "config", "revision"].includes(k),
      ) ||
      (value.revision !== undefined && !Number.isSafeInteger(value.revision))
    )
      return fail("INVALID_ARGUMENT");
    await settings.saveWriteOnly(
      id,
      value.config,
      value.revision as number | undefined,
    );
    return {
      ok: true,
      ...(await settings.publicState()),
    };
  }
  const config = await settings.resolve(id);
  if (kind === "PROVIDER_MODELS") {
    const result = await transport.listModels(config);
    return { ok: true, ...result };
  }
  if (kind === "PROVIDER_TEST" && config.kind === "typesafe_jev") {
    const response = await evaluateJev(transport, config, {
      phase: "candidate_selection",
      state: { value: "blue" },
      questions: {
        color: {
          type: "choice",
          instructions: "Select the supplied color exactly.",
          criteria: { blue: "The value is blue", red: "The value is red" },
        },
      },
    });
    if (acceptedChoice(response, "color") !== "blue")
      return fail(
        "PROVIDER_UNAVAILABLE",
        "native semantic connection test failed",
      );
    return {
      ok: true,
      status: 200,
      model: response.model,
      usage: response.usage,
    };
  }
  if (kind === "PROVIDER_TEST")
    return testProvider(payload, {
      resolveConfig: async () => config,
      resolveAdapter: resolveOpenAiCompatible,
      send: (c, a, r) => transport.send(c, a, r),
    });
  return fail("INVALID_ARGUMENT");
};
