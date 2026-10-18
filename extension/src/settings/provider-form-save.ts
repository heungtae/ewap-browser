import { settingsErrorMessage } from "./settings-errors.js";
import { runtime } from "./settings-browser.js";
import {
  field,
  show,
  form,
  headersContainer,
  readHeaders,
} from "./provider-form-fields.js";
import { validateProviderBaseUrl } from "../providers/provider-network-url.js";
import { markFormSaved } from "./form-feedback.js";
import type { initializeProviderManagement } from "./provider-management.js";
export const createProviderSave = (
  management: ReturnType<typeof initializeProviderManagement>,
) => {
  const saveProvider = async (): Promise<{
    id: string;
    wire_api: "chat_completions" | "responses";
    model: string;
    base_url: string;
    api_key_header: string;
    api_key_configured: boolean;
  }> => {
    const id = field("provider_id").value.trim();
    const baseUrl = field("base_url").value.trim();
    let parsed: URL;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new Error("Endpoint URL 형식을 확인해 주세요.");
    }
    const ollamaEndpoint = parsed.port === "11434";
    const optIn = field("private_network_opt_in");
    validateProviderBaseUrl(
      baseUrl,
      optIn instanceof HTMLInputElement && optIn.checked,
    );
    const apiKey = field("api_key").value;
    const apiKeyHeader = field("api_key_header").value;
    const model = field("model").value.trim();
    if (!model) throw new Error("모델명을 입력해 주세요.");
    let headers: Array<{ name: string; value: string }>;
    try {
      headers = readHeaders();
    } catch {
      throw new Error("HTTP header name과 value를 함께 입력해 주세요.");
    }
    const jev = field("provider_kind").value === "typesafe_jev";
    const provider = {
      kind: jev ? "typesafe_jev" : "openai_compatible",
      plugin_id: jev
        ? "contextpilot.typesafe-jev"
        : "contextpilot.openai-compatible",
      plugin_version: "1.0.0",
      label: field("provider_id").value,
      base_url: baseUrl,
      wire_api: (jev
        ? "chat_completions"
        : field("wire_api").value === "auto"
          ? ollamaEndpoint
            ? "chat_completions"
            : "responses"
          : field("wire_api").value) as "chat_completions" | "responses",
      model,
      api_key: apiKey,
      api_key_header: apiKeyHeader,
      headers,
      timeout_ms: 120_000,
      enabled: (field("enabled") as HTMLInputElement).checked,
      private_network_opt_in:
        optIn instanceof HTMLInputElement && optIn.checked,
    };
    if (!runtime) throw new Error("확장 프로그램 런타임에 연결할 수 없습니다.");
    const response = (await runtime.sendMessage({
      kind: "PROVIDER_SAVE",
      payload: {
        id,
        config: provider,
        revision: management.revision(),
      },
    })) as Record<string, unknown>;
    if (response?.ok !== true)
      throw new Error(
        typeof response?.code === "string"
          ? response.code
          : "PROVIDER_UNAVAILABLE",
      );
    field("api_key").value = "";
    headersContainer
      ?.querySelectorAll<HTMLInputElement>('input[name="header_value"]')
      .forEach((input) => {
        input.value = "";
      });
    await management.refresh(id);
    markFormSaved(form);
    return {
      id,
      wire_api: provider.wire_api,
      model: provider.model,
      base_url: provider.base_url,
      api_key_header: provider.api_key_header,
      api_key_configured:
        (
          response.providers as
            | Record<string, { has_api_key?: boolean }>
            | undefined
        )?.[field("provider_id").value]?.has_api_key === true,
    };
  };

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveProvider()
      .then(() =>
        show("저장했습니다. API key는 다시 표시하거나 export하지 않습니다."),
      )
      .catch((error: unknown) =>
        show(
          error instanceof Error
            ? settingsErrorMessage(error)
            : "설정을 저장하지 못했습니다.",
        ),
      );
  });

  return saveProvider;
};
export type SaveProvider = ReturnType<typeof createProviderSave>;
