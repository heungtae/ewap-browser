import { isFormDirty, markFormSaved } from "./form-feedback.js";
import type { PublicProvider } from "./provider-public-import.js";
const element = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
export const createProviderEditors = (
  loadPrimary: (id: string, config: PublicProvider) => void,
  loadDecision: (id: string, config?: PublicProvider) => void,
  providers: () => Record<string, PublicProvider>,
) => {
  const primary = element<HTMLSelectElement>("provider-primary-select");
  const decision = element<HTMLSelectElement>("provider-decision-select");
  const primaryForm = element<HTMLFormElement>("provider-form");
  const decisionForm = element<HTMLFormElement>("decision-provider-form");
  const id = (isDecision: boolean) =>
    isDecision
      ? element<HTMLInputElement>("decision-provider-id").value.trim()
      : (
          primaryForm.elements.namedItem("provider_id") as HTMLInputElement
        ).value.trim();
  const updateRemoval = () => {
    element<HTMLButtonElement>("provider-remove-delete").disabled =
      !providers()[id(false)];
    element<HTMLButtonElement>("decision-provider-remove-delete").disabled =
      !providers()[id(true)];
  };
  const load = (
    providerId: string,
    config: PublicProvider,
    interactive = false,
  ) => {
    const isDecision = config.kind === "typesafe_jev";
    const form = isDecision ? decisionForm : primaryForm;
    if (
      interactive &&
      isFormDirty(form) &&
      !window.confirm(
        "편집 중인 변경사항을 버리고 선택한 Provider를 불러올까요?",
      )
    )
      return false;
    if (isDecision) loadDecision(providerId, config);
    else loadPrimary(providerId, config);
    markFormSaved(form);
    const select = isDecision ? decision : primary;
    select.value = providers()[providerId] ? providerId : "";
    updateRemoval();
    return true;
  };
  for (const [select, isDecision] of [
    [primary, false],
    [decision, true],
  ] as const) {
    select.addEventListener("change", () => {
      const providerId = select.value;
      const config = providers()[providerId];
      if (config && !load(providerId, config, true))
        select.value = providers()[id(isDecision)] ? id(isDecision) : "";
    });
  }
  primaryForm.addEventListener("input", updateRemoval);
  decisionForm.addEventListener("input", updateRemoval);
  let initialized = false;
  const refresh = (savedId?: string, removedId?: string) => {
    for (const isDecision of [false, true]) {
      const select = isDecision ? decision : primary;
      if (removedId && id(isDecision) === removedId) {
        const next = Object.entries(providers()).find(
          ([, config]) => (config.kind === "typesafe_jev") === isDecision,
        );
        if (next) load(next[0], next[1]);
        else {
          if (isDecision) loadDecision("jev");
          else
            loadPrimary("local", {
              kind: "openai_compatible",
              plugin_id: "contextpilot.openai-compatible",
              plugin_version: "1.0.0",
              label: "local",
              base_url: "",
              model: "qwen",
              wire_api: "responses",
              api_key_header: "none",
              header_names: [],
              has_api_key: false,
              enabled: true,
            });
          markFormSaved(isDecision ? decisionForm : primaryForm);
        }
      } else if (!initialized && providers()[select.value])
        load(select.value, providers()[select.value]!);
    }
    if (savedId && providers()[savedId]) load(savedId, providers()[savedId]!);
    initialized = true;
    updateRemoval();
  };
  return { load, refresh, id, updateRemoval };
};
