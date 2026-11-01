import {
  field,
  form,
  readHeaders,
  headersContainer,
  show,
} from "../../../../extension/src/settings/provider-form-fields.js";
import { markFormSaved } from "../../../../extension/src/settings/form-feedback.js";
export function initializeProviderSave(
  client: { sendMessage(value: unknown): Promise<unknown> },
  management: { revision(): number; refresh(id?: string): Promise<void> },
) {
  if (!form) return;
  let saving = false;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (saving) return;
    saving = true;
    show("설정을 저장하는 중입니다.");
    const save = async () => {
      const jev = field("provider_kind").value === "typesafe_jev";
      const id = field("provider_id").value.trim();
      const wire = field("wire_api").value;
      await client.sendMessage({
        kind: "PROVIDER_SAVE",
        payload: {
          id,
          revision: management.revision(),
          config: {
            kind: jev ? "typesafe_jev" : "openai_compatible",
            plugin_id: jev
              ? "contextpilot.typesafe-jev"
              : "contextpilot.openai-compatible",
            plugin_version: "1.0.0",
            label: id,
            base_url: field("base_url").value.trim(),
            model: field("model").value.trim(),
            wire_api: jev
              ? "chat_completions"
              : wire === "auto"
                ? "responses"
                : wire,
            api_key: field("api_key").value,
            api_key_header: field("api_key_header").value,
            headers: readHeaders(),
            timeout_ms: 120000,
            enabled: (field("enabled") as HTMLInputElement).checked,
            private_network_opt_in: (
              field("private_network_opt_in") as HTMLInputElement
            ).checked,
          },
        },
      });
      field("api_key").value = "";
      headersContainer
        ?.querySelectorAll<HTMLInputElement>('input[name="header_value"]')
        .forEach((input) => {
          input.value = "";
        });
      await management.refresh(id);
      markFormSaved(form);
      show(
        "저장했습니다. API key와 헤더 값은 다시 표시하거나 export하지 않습니다.",
      );
    };
    void save()
      .catch(() =>
        show(
          "설정을 저장하지 못했습니다. 값과 모델 역할을 확인하고 목록을 새로 고침해 주세요.",
        ),
      )
      .finally(() => {
        saving = false;
      });
  });
}
