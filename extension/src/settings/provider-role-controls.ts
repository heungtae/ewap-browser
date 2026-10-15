import type { PublicProvider } from "./provider-public-import.js";
type Send = (
  kind: string,
  payload?: unknown,
) => Promise<Record<string, unknown>>;
const element = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
export const createProviderRoleControls = (send: Send) => {
  const primary = element<HTMLSelectElement>("provider-primary-select");
  const decision = element<HTMLSelectElement>("provider-decision-select");
  const enabled = element<HTMLInputElement>("provider-jev-enabled");
  const failure = element<HTMLSelectElement>("provider-jev-failure");
  const status = element<HTMLOutputElement>("provider-routing-status");
  let revision = 0;
  const fill = (
    select: HTMLSelectElement,
    entries: [string, PublicProvider][],
  ) => {
    select.replaceChildren(
      ...[["", undefined] as const, ...entries].map(([id, config]) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = id
          ? `${id}${config?.enabled === false ? " (비활성)" : ""}`
          : "선택 안 함";
        return option;
      }),
    );
  };
  return {
    revision: () => revision,
    primary: () => primary.value,
    async apply() {
      await send("PROVIDER_SET_ROUTING", {
        revision,
        routing: {
          mode: enabled.checked ? "jev" : "single",
          ...(decision.value ? { decision_provider: decision.value } : {}),
          pre_dispatch_failure: failure.value,
        },
      });
    },
    refresh(
      providers: Record<string, PublicProvider>,
      state: Record<string, unknown>,
    ) {
      revision = Number(state.revision);
      fill(
        primary,
        Object.entries(providers).filter(([, p]) => p.kind !== "typesafe_jev"),
      );
      fill(
        decision,
        Object.entries(providers).filter(([, p]) => p.kind === "typesafe_jev"),
      );
      primary.value =
        typeof state.active_provider === "string" ? state.active_provider : "";
      const routing = state.routing as {
        mode: string;
        decision_provider?: string;
        pre_dispatch_failure: string;
      };
      decision.value = routing.decision_provider ?? "";
      enabled.checked = routing.mode === "jev";
      failure.value = routing.pre_dispatch_failure;
      status.value =
        state.primary_configured === false
          ? "기존 처리 Provider 설정이 필요합니다."
          : state.effective_mode === "jev"
            ? "Jev 판단과 기존 모델 처리를 사용합니다."
            : routing.mode === "single"
              ? "기존 모델만 사용 중 · Jev 자동 판단 꺼짐"
              : "기존 모델만 사용 중 · Jev 미설정 또는 비활성";
    },
  };
};
