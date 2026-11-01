import type { PublicProvider } from "../../../../extension/src/settings/provider-public-import.js";
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
          : "선택하세요";
        return option;
      }),
    );
  };
  return {
    revision: () => revision,
    primary: () => primary.value,
    async apply() {
      if (enabled.checked && !decision.value)
        throw new Error(
          "자동 판단에 사용할 판단 LLM Provider를 먼저 선택하세요.",
        );
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
          ? "GPT Analyst를 선택하고 적용하세요."
          : routing.mode === "jev"
            ? "Controller·Analyst 역할을 저장했습니다. 작업 준비 상태는 별도로 확인합니다."
            : "Controller 사용이 꺼져 있습니다. 자율 작업은 시작되지 않습니다.";
      if (state.secret_mode === "session-only")
        status.value +=
          " 인증 정보는 세션에만 보관되며 Backend 재시작 후 다시 입력해야 합니다.";
    },
  };
};
