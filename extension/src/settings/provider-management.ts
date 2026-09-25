type Runtime = { sendMessage(message: unknown): Promise<unknown> };
import {
  parsePublicProviderImport,
  type PublicProvider,
} from "./provider-public-import.js";
type Plugin = {
  manifest: { plugin_id: string; plugin_version: string; label: string };
  enabled: boolean;
  bundled: boolean;
};
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
        ? response.code
        : "PROVIDER_UNAVAILABLE",
    );
  return response;
};

export const initializeProviderManagement = (
  runtime: Runtime,
  onSelected: (id: string, config: PublicProvider) => void,
) => {
  const pluginSelect = element<HTMLSelectElement>("provider-plugin-select");
  const activeSelect = element<HTMLSelectElement>("provider-active-select");
  const status = element<HTMLOutputElement>("provider-management-status");
  const file = element<HTMLInputElement>("plugin-manifest-file");
  const publicFile = element<HTMLInputElement>("provider-public-file");
  let plugins: Plugin[] = [];
  let providers: Record<string, PublicProvider> = {};
  const currentPlugin = () => pluginSelect.value;
  const currentProvider = () => activeSelect.value;
  const refresh = async () => {
    const list = await send(runtime, "PROVIDER_LIST");
    const exported = await send(runtime, "PROVIDER_EXPORT");
    plugins = list.plugins as Plugin[];
    providers = list.providers as Record<string, PublicProvider>;
    const previousPlugin = pluginSelect.value;
    const previousProvider = activeSelect.value;
    pluginSelect.replaceChildren(
      ...plugins.map((plugin) => {
        const option = document.createElement("option");
        option.value = plugin.manifest.plugin_id;
        option.textContent = `${plugin.manifest.label} ${plugin.manifest.plugin_version}${plugin.enabled ? "" : " (비활성)"}`;
        return option;
      }),
    );
    if (plugins.some((plugin) => plugin.manifest.plugin_id === previousPlugin))
      pluginSelect.value = previousPlugin;
    activeSelect.replaceChildren(
      ...Object.entries(providers).map(([id, provider]) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = `${id}${provider.enabled === false ? " (비활성)" : ""}`;
        return option;
      }),
    );
    const exportedState = exported.export as { active_provider?: string };
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
  ) => {
    element<HTMLButtonElement>(id).addEventListener("click", () => {
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
  action("plugin-install", async () => {
    const selected = file.files?.[0];
    if (!selected || selected.size > 32_768)
      throw new Error("32 KB 이하의 manifest JSON을 선택하세요.");
    await send(
      runtime,
      "PLUGIN_INSTALL",
      JSON.parse(await selected.text()) as unknown,
    );
    file.value = "";
  });
  action("plugin-enable", async () => {
    await send(runtime, "PLUGIN_SET_ENABLED", {
      plugin_id: currentPlugin(),
      enabled: true,
    });
  });
  action("plugin-disable", async () => {
    await send(runtime, "PLUGIN_SET_ENABLED", {
      plugin_id: currentPlugin(),
      enabled: false,
    });
  });
  action("plugin-remove-keep", async () => {
    await send(runtime, "PLUGIN_REMOVE", {
      plugin_id: currentPlugin(),
      delete_linked_secrets: false,
    });
  });
  action("plugin-remove-delete", async () => {
    await send(runtime, "PLUGIN_REMOVE", {
      plugin_id: currentPlugin(),
      delete_linked_secrets: true,
    });
  });
  action("provider-activate", async () => {
    await send(runtime, "PROVIDER_SET_ACTIVE", { id: currentProvider() });
  });
  action("provider-remove-keep", async () => {
    await send(runtime, "PROVIDER_REMOVE", {
      id: currentProvider(),
      delete_secret: false,
    });
  });
  action("provider-remove-delete", async () => {
    await send(runtime, "PROVIDER_REMOVE", {
      id: currentProvider(),
      delete_secret: true,
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
  action(
    "provider-import",
    async () => {
      const selected = publicFile.files?.[0];
      if (!selected || selected.size > 65_536)
        throw new Error("64 KB 이하의 공개 설정 JSON을 선택하세요.");
      const { id, config } = parsePublicProviderImport(
        JSON.parse(await selected.text()) as unknown,
      );
      if (
        !plugins.some(
          (plugin) => plugin.manifest.plugin_id === config.plugin_id,
        )
      )
        throw new Error("먼저 해당 Plugin manifest를 설치하세요.");
      onSelected(id, { ...config, has_api_key: false });
      publicFile.value = "";
      status.value =
        "공개 설정을 양식에 불러왔습니다. secret을 입력하고 저장하세요.";
    },
    false,
  );
  void refresh().catch((error: unknown) => {
    status.value =
      error instanceof Error
        ? error.message
        : "Provider 목록을 불러오지 못했습니다.";
  });
  return {
    refresh,
    pluginVersion: () =>
      plugins.find((item) => item.manifest.plugin_id === pluginSelect.value)
        ?.manifest.plugin_version ?? "1.0.0",
  };
};
