import { settingsErrorMessage } from "./settings-errors.js";
import { initializeProviderImport } from "./provider-import-controls.js";
import { downloadProviderExport } from "./provider-download.js";
import { createDecisionProviderForm } from "./decision-provider-form.js";
import { createProviderRoleControls } from "./provider-role-controls.js";
import { createProviderEditors } from "./provider-editors.js";
import { type PublicProvider } from "./provider-public-import.js";
type Runtime = { sendMessage(message: unknown): Promise<unknown> };
const element = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
const send = async (runtime: Runtime, kind: string, payload?: unknown) => {
  const response = (await runtime.sendMessage({ kind, payload })) as Record<
    string,
    unknown
  >;
  if (response?.ok !== true)
    throw new Error(
      typeof response?.code === "string"
        ? response.code
        : "Provider 설정 작업에 실패했습니다.",
    );
  return response;
};
export const initializeProviderManagement = (
  runtime: Runtime,
  onSelected: (id: string, config: PublicProvider) => void,
) => {
  const status = element<HTMLOutputElement>("provider-management-status");
  const file = element<HTMLInputElement>("provider-public-file");
  const roles = createProviderRoleControls((kind, payload) =>
    send(runtime, kind, payload),
  );
  let providers: Record<string, PublicProvider> = {};
  const decisionForm = createDecisionProviderForm(
    (kind, payload) => send(runtime, kind, payload),
    roles.revision,
    (id) => refresh(id),
  );
  const editors = createProviderEditors(
    onSelected,
    decisionForm.load,
    () => providers,
  );
  const refresh = async (savedId?: string, removedId?: string) => {
    const list = await send(runtime, "PROVIDER_LIST");
    providers = list.providers as Record<string, PublicProvider>;
    roles.refresh(providers, list);
    editors.refresh(savedId, removedId);
  };
  const action = (
    id: string,
    run: () => Promise<void | false>,
    refreshAfter = true,
    event = "click",
  ) => {
    const control = element<HTMLButtonElement>(id);
    control.addEventListener(event, () => {
      if (control.disabled) return;
      control.disabled = true;
      void run()
        .then(async (changed) => {
          if (changed === false || !refreshAfter) return;
          await refresh();
          status.value = "변경사항을 저장했습니다.";
        })
        .catch((error: unknown) => {
          const formId = control.closest("form")?.id;
          const feedback =
            formId === "provider-form"
              ? element<HTMLOutputElement>("settings-status")
              : formId === "decision-provider-form"
                ? element<HTMLOutputElement>("decision-provider-status")
                : status;
          feedback.value = settingsErrorMessage(error);
        })
        .finally(() => {
          control.disabled = false;
          editors.updateRemoval();
        });
    });
  };
  action("provider-activate", async () => {
    if (!roles.primary())
      throw new Error("기본 LLM Provider를 먼저 선택하세요.");
    await send(runtime, "PROVIDER_SET_ACTIVE", {
      id: roles.primary(),
      revision: roles.revision(),
    });
  });
  action("provider-routing-apply", () => roles.apply());
  for (const isDecision of [false, true]) {
    action(
      isDecision ? "decision-provider-remove-delete" : "provider-remove-delete",
      async () => {
        const id = editors.id(isDecision);
        if (!providers[id])
          throw new Error("저장된 Provider만 삭제할 수 있습니다.");
        if (
          !window.confirm(`‘${id}’ Provider와 저장된 인증 정보를 삭제할까요?`)
        )
          return false;
        await send(runtime, "PROVIDER_REMOVE", {
          id,
          delete_secret: true,
          revision: roles.revision(),
        });
        await refresh(undefined, id);
        status.value = "Provider를 삭제했습니다.";
      },
      false,
    );
  }
  action(
    "provider-export",
    async () => {
      const id = (
        element<HTMLFormElement>("provider-form").elements.namedItem(
          "provider_id",
        ) as HTMLInputElement
      ).value.trim();
      downloadProviderExport(await send(runtime, "PROVIDER_EXPORT"), id);
      status.value = `‘${id}’의 저장된 설정을 내보냈습니다. API key와 헤더 값은 제외됩니다.`;
    },
    false,
  );
  initializeProviderImport(file, editors.load, status, action);
  void refresh().catch(() => {
    status.value =
      "Provider 목록을 불러오지 못했습니다. 설정 페이지를 다시 열어 주세요.";
  });
  return { refresh, revision: roles.revision };
};
