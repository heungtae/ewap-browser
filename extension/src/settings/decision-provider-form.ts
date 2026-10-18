import { settingsErrorMessage } from "./settings-errors.js";
import { downloadProviderExport } from "./provider-download.js";
import { markFormSaved } from "./form-feedback.js";
import type { PublicProvider } from "./provider-public-import.js";
type Send = (
  kind: string,
  payload?: unknown,
) => Promise<Record<string, unknown>>;
const element = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
export const createDecisionProviderForm = (
  send: Send,
  revision: () => number,
  refresh: (id: string) => Promise<void>,
) => {
  const form = element<HTMLFormElement>("decision-provider-form");
  const input = (name: string) =>
    element<HTMLInputElement>(`decision-provider-${name}`);
  const status = element<HTMLOutputElement>("decision-provider-status");
  const keyToggle = element<HTMLButtonElement>("decision-provider-key-toggle");
  const hideKey = () => {
    input("key").type = "password";
    keyToggle.textContent = "표시";
    keyToggle.setAttribute("aria-pressed", "false");
  };
  keyToggle.addEventListener("click", () => {
    const visible = input("key").type === "password";
    input("key").type = visible ? "text" : "password";
    keyToggle.textContent = visible ? "숨김" : "표시";
    keyToggle.setAttribute("aria-pressed", String(visible));
  });
  let current: PublicProvider | undefined;
  const load = (id: string, config?: PublicProvider) => {
    current = config;
    input("id").value = id;
    input("url").value = config?.base_url ?? "https://api.typesafe.ai/v1";
    input("model").value = config?.model ?? "jev-1.13.0";
    input("enabled").checked = config?.enabled !== false;
    input("key").value = "";
    hideKey();
    element<HTMLElement>("decision-provider-key-state").textContent =
      config?.has_api_key
        ? "저장됨. 변경할 때만 새 값을 입력하세요."
        : "새 API key만 입력하세요.";
  };
  const save = async () => {
    const id = input("id").value.trim();
    await send("PROVIDER_SAVE", {
      id,
      revision: revision(),
      config: {
        kind: "typesafe_jev",
        plugin_id: "contextpilot.typesafe-jev",
        plugin_version: "1.0.0",
        label: id,
        base_url: input("url").value.trim(),
        model: input("model").value.trim(),
        api_key: input("key").value,
        api_key_header: "authorization_bearer",
        wire_api: "chat_completions",
        headers: (current?.header_names ?? []).map((name) => ({
          name,
          value: "",
        })),
        timeout_ms: current?.timeout_ms ?? 120_000,
        private_network_opt_in: current?.private_network_opt_in === true,
        enabled: input("enabled").checked,
      },
    });
    input("key").value = "";
    hideKey();
    await refresh(id);
    markFormSaved(form);
    status.value =
      "저장했습니다. 관리 영역에서 판단 Provider를 선택하고 적용하세요.";
    return id;
  };
  const run = (action: () => Promise<void>) => {
    void action().catch((error: unknown) => {
      status.value = settingsErrorMessage(error);
    });
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      await save();
    });
  });
  element<HTMLButtonElement>("decision-provider-test").addEventListener(
    "click",
    () => {
      if (!form.reportValidity()) return;
      run(async () => {
        const id = await save();
        status.value = "Jev 연결을 테스트하는 중입니다.";
        const result = await send("PROVIDER_TEST", { id });
        status.value = `Jev 연결 테스트 성공 (HTTP ${result.status}, ${result.model})`;
      });
    },
  );
  element<HTMLButtonElement>("decision-provider-export").addEventListener(
    "click",
    () => {
      run(async () => {
        const id = input("id").value.trim();
        downloadProviderExport(await send("PROVIDER_EXPORT"), id);
        status.value =
          "저장된 Provider 공개 설정을 내보냈습니다. API key는 제외됩니다.";
      });
    },
  );
  return { load };
};
