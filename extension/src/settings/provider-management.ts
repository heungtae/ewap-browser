import { createProviderRoleControls } from "./provider-role-controls.js";
type Runtime = { sendMessage(message: unknown): Promise<unknown> };
import {
  parsePublicProviderImport,
  type PublicProvider,
} from "./provider-public-import.js";
const element = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing Settings element: ${id}`);
  return found as T;
};
const send = async (runtime: Runtime, kind: string, payload?: unknown) => {
  const response = (await runtime.sendMessage({ kind, payload })) as Record<
    string,
    unknown
  >;
  if (!response || response.ok !== true)
    throw new Error(
      typeof response?.code === "string"
        ? response.code +
          (typeof response.detail === "string" ? `: ${response.detail}` : "")
        : "PROVIDER_UNAVAILABLE",
    );
  return response;
};

export const initializeProviderManagement = (
  runtime: Runtime,
  onSelected: (id: string, config: PublicProvider) => void,
) => {
  const activeSelect = element<HTMLSelectElement>("provider-active-select");
  const status = element<HTMLOutputElement>("provider-management-status");
  const publicFile = element<HTMLInputElement>("provider-public-file");
  const roles = createProviderRoleControls((kind, payload) =>
    send(runtime, kind, payload),
  );
  let providers: Record<string, PublicProvider> = {};
  const currentProvider = () => activeSelect.value;
  const refresh = async () => {
    const list = await send(runtime, "PROVIDER_LIST");
    roles.refresh(list.providers as Record<string, PublicProvider>, list);
    providers = list.providers as Record<string, PublicProvider>;
    const previousProvider = activeSelect.value;
    activeSelect.replaceChildren(
      ...Object.entries(providers).map(([id, provider]) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = `${id}${provider.enabled === false ? " (비활성)" : ""}`;
        return option;
      }),
    );
    const exportedState = list as { active_provider?: string };
    activeSelect.value =
      previousProvider && providers[previousProvider]
        ? previousProvider
        : (exportedState.active_provider ?? "");
    if (activeSelect.value && providers[activeSelect.value])
      onSelected(activeSelect.value, providers[activeSelect.value]!);
  };
  const action = (
    id: string,
    run: () => Promise<void>,
    refreshAfter = true,
    event = "click",
  ) => {
    element<HTMLElement>(id).addEventListener(event, () => {
      void run()
        .then(() => (refreshAfter ? refresh() : undefined))
        .then(() => {
          if (refreshAfter) status.value = "변경사항을 저장했습니다.";
        })
        .catch((error: unknown) => {
          status.value =
            error instanceof Error ? error.message : "작업에 실패했습니다.";
        });
    });
  };
  activeSelect.addEventListener("change", () => {
    const id = currentProvider();
    if (providers[id]) onSelected(id, providers[id]!);
  });
  action("provider-activate", async () => {
    await send(runtime, "PROVIDER_SET_ACTIVE", {
      id: roles.primary(),
      revision: roles.revision(),
    });
  });
  action("provider-routing-apply", () => roles.apply());
  action("provider-remove-delete", async () => {
    await send(runtime, "PROVIDER_REMOVE", {
      id: currentProvider(),
      delete_secret: true,
      revision: roles.revision(),
    });
  });
  action(
    "provider-export",
    async () => {
      const exported = await send(runtime, "PROVIDER_EXPORT");
      const blob = new Blob([JSON.stringify(exported.export, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "contextpilot-provider-public.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    false,
  );
  element<HTMLButtonElement>("provider-import").addEventListener(
    "click",
    () => {
      publicFile.value = "";
      publicFile.click();
    },
  );
  action(
    "provider-public-file",
    async () => {
      const selected = publicFile.files?.[0];
      if (!selected) return;
      if (selected.size > 65_536)
        throw new Error("64 KB 이하의 LLM Provider 설정 JSON을 선택하세요.");
      const { id, config } = parsePublicProviderImport(
        JSON.parse(await selected.text()) as unknown,
      );
      onSelected(id, { ...config, has_api_key: false });
      publicFile.value = "";
      status.value =
        "LLM Provider 설정을 양식에 불러왔습니다. API key를 입력하고 저장하세요.";
    },
    false,
    "change",
  );
  void refresh().catch((error: unknown) => {
    status.value =
      error instanceof Error
        ? error.message
        : "Provider 목록을 불러오지 못했습니다.";
  });
  return { refresh, revision: roles.revision };
};
