import {
  parsePublicProviderImport,
  type PublicProvider,
} from "./provider-public-import.js";
export const initializeProviderImport = (
  file: HTMLInputElement,
  selectProvider: (
    id: string,
    config: PublicProvider,
    focus: boolean,
  ) => boolean,
  status: HTMLOutputElement,
  action: (
    id: string,
    run: () => Promise<void>,
    refresh: boolean,
    event: string,
  ) => void,
) => {
  const element = <T extends HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  element<HTMLButtonElement>("provider-import").addEventListener(
    "click",
    () => {
      file.value = "";
      file.click();
    },
  );
  action(
    "provider-public-file",
    async () => {
      const selected = file.files?.[0];
      if (!selected) return;
      if (selected.size > 65_536)
        throw new Error("64 KB 이하의 LLM Provider 설정 JSON을 선택하세요.");
      const { id, config } = parsePublicProviderImport(
        JSON.parse(await selected.text()) as unknown,
      );
      if (!selectProvider(id, { ...config, has_api_key: false }, true)) return;
      const form = element<HTMLFormElement>(
        config.kind === "typesafe_jev"
          ? "decision-provider-form"
          : "provider-form",
      );
      form.dispatchEvent(new Event("input", { bubbles: true }));
      file.value = "";
      status.value =
        "LLM Provider 설정을 양식에 불러왔습니다. 필요한 인증 정보를 입력하고 저장하세요.";
    },
    false,
    "change",
  );
};
