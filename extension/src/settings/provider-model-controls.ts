import { settingsErrorMessage } from "./settings-errors.js";
import { runtime } from "./settings-browser.js";
import { field, show } from "./provider-form-fields.js";
import type { SaveProvider } from "./provider-form-save.js";
export const initializeProviderModels = (saveProvider: SaveProvider) => {
  const providerModelsLoad = document.querySelector<HTMLButtonElement>(
    "#provider-models-load",
  );
  const providerModels =
    document.querySelector<HTMLDataListElement>("#provider-models");
  const providerModelSelectionDialog =
    document.querySelector<HTMLDialogElement>(
      "#provider-model-selection-dialog",
    );
  const providerModelSelection = document.querySelector<HTMLSelectElement>(
    "#provider-model-selection",
  );
  const providerModelSelectionCancel =
    document.querySelector<HTMLButtonElement>(
      "#provider-model-selection-cancel",
    );
  const providerModelSelectionConfirm =
    document.querySelector<HTMLButtonElement>(
      "#provider-model-selection-confirm",
    );
  providerModelSelection?.addEventListener("change", () => {
    if (providerModelSelectionConfirm)
      providerModelSelectionConfirm.disabled = !providerModelSelection.value;
  });
  providerModelSelectionCancel?.addEventListener("click", () => {
    providerModelSelectionDialog?.close();
  });
  providerModelSelectionConfirm?.addEventListener("click", () => {
    void (async () => {
      const model = providerModelSelection?.value;
      if (!model) return;
      providerModelSelectionConfirm.disabled = true;
      try {
        field("model").value = model;
        await saveProvider();
        providerModelSelectionDialog?.close();
        show(`모델을 선택하고 저장했습니다 (${model})`);
      } catch (error: unknown) {
        show(
          error instanceof Error
            ? `모델 저장 실패 (${settingsErrorMessage(error)})`
            : "모델을 저장하지 못했습니다.",
        );
      } finally {
        providerModelSelectionConfirm.disabled = false;
      }
    })();
  });

  providerModelsLoad?.addEventListener("click", () => {
    void (async () => {
      if (!runtime) {
        show("확장 프로그램 런타임에 연결할 수 없습니다.");
        return;
      }
      try {
        const provider = await saveProvider();
        show("모델을 불러오는 중입니다.");
        const response = await runtime.sendMessage({
          kind: "PROVIDER_MODELS",
          payload: { id: provider.id },
        });
        if (
          typeof response === "object" &&
          response !== null &&
          (response as { ok?: unknown }).ok !== true
        ) {
          const code =
            typeof (response as { code?: unknown }).code === "string"
              ? (response as { code: string }).code
              : "UNKNOWN";
          const detail =
            typeof (response as { detail?: unknown }).detail === "string"
              ? `: ${(response as { detail: string }).detail}`
              : "";
          throw new Error(`${code}${detail}`);
        }
        const models =
          typeof response === "object" &&
          response !== null &&
          Array.isArray((response as { models?: unknown }).models)
            ? (response as { models: unknown[] }).models.filter(
                (model): model is string => typeof model === "string",
              )
            : [];
        if (!models.length) throw new Error("모델을 찾지 못했습니다.");
        providerModels?.replaceChildren(
          ...models.map((model) => {
            const option = document.createElement("option");
            option.value = model;
            return option;
          }),
        );
        if (models.length === 1) {
          field("model").value = models[0] ?? "";
          await saveProvider();
          show(`모델 불러오기 완료 (1개: ${models[0]})`);
          return;
        }
        if (providerModelSelection && providerModelSelectionDialog) {
          providerModelSelection.replaceChildren();
          const placeholder = document.createElement("option");
          placeholder.value = "";
          placeholder.textContent = "모델을 선택하세요";
          placeholder.disabled = true;
          placeholder.selected = true;
          providerModelSelection.append(placeholder);
          for (const model of models) {
            const option = document.createElement("option");
            option.value = model;
            option.textContent = model;
            providerModelSelection.append(option);
          }
          if (providerModelSelectionConfirm)
            providerModelSelectionConfirm.disabled = true;
          providerModelSelectionDialog.showModal();
        }
        show(
          `모델 불러오기 완료 (${models.length}개). 팝업에서 모델을 선택하세요.`,
        );
      } catch (error: unknown) {
        show(
          error instanceof Error
            ? `모델 불러오기 실패 (${settingsErrorMessage(error)})`
            : "모델을 불러오지 못했습니다.",
        );
      }
    })();
  });
};
