import { defaultAgentPreferences } from "../../../../packages/shared/src/preferences.js";
import { markFormSaved } from "../../../../extension/src/settings/form-feedback.js";
import { createPreferencesView } from "./approval-preferences-view.js";
import type { createSettingsClient } from "./settings-client.js";
export function initializeAgentPreferences(
  client: ReturnType<typeof createSettingsClient>,
) {
  const form = document.querySelector<HTMLFormElement>(
    "#agent-preferences-form",
  );
  if (!form) return;
  const status = document.querySelector<HTMLOutputElement>(
    "#agent-preferences-status",
  )!;
  const view = createPreferencesView(form);
  const controls = [
    ...form.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLButtonElement
    >("input,select,button"),
  ];
  const lock = (value: boolean) => {
    for (const control of controls) control.disabled = value;
  };
  let revision: number | undefined;
  let pending = false;
  view.apply(defaultAgentPreferences());
  lock(true);
  void client
    .read()
    .then((state) => {
      revision = state.revision;
      view.apply(state.preferences ?? defaultAgentPreferences());
      lock(false);
      status.value = "Backend 작업 설정을 불러왔습니다.";
    })
    .catch(() => {
      status.value = "Backend unavailable — 작업 설정을 불러오지 못했습니다.";
    });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (pending || revision === undefined) return;
    pending = true;
    lock(true);
    void (async () => {
      const state = await client.savePreferences(revision!, view.read());
      revision = state.revision;
      view.apply(state.preferences ?? defaultAgentPreferences());
      markFormSaved(form);
      status.value =
        "작업 설정을 저장했습니다. Backend 작업 연결 후 적용됩니다.";
    })()
      .catch((error) => {
        status.value =
          error instanceof Error
            ? error.message
            : "작업 설정을 저장하지 못했습니다.";
      })
      .finally(() => {
        pending = false;
        lock(false);
      });
  });
}
