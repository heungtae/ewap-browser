import { initializeBrowserPermissions } from "./browser-permissions.js";
import { initializeAgentPreferences } from "./agent-preferences.js";
import { initializeProviderManagement } from "./provider-management.js";
import {
  loadProviderForm,
  show,
} from "../../../../extension/src/settings/provider-form-fields.js";
import { initializeFormFeedback } from "../../../../extension/src/settings/form-feedback.js";
import { createSettingsClient } from "./settings-client.js";
import { initializeProviderSave } from "./provider-save.js";
import { createAdvisoryClient } from "./advisory-client.js";
import { initializeAdvisoryOptions } from "./advisory-options.js";
import { initializeAdvisoryWorkflows } from "./advisory-workflows.js";
import { request } from "../bridge/presentation-client.js";
let initialized = false;
export function initializeBackendSettings() {
  if (initialized) return;
  initialized = true;
  initializeFormFeedback();
  const advisory = createAdvisoryClient();
  initializeAdvisoryOptions(advisory);
  initializeAdvisoryWorkflows(advisory);
  const client = createSettingsClient((command) =>
    request(command).catch((error) => {
      show("Backend disconnected — 설정 연결을 확인해 주세요.");
      throw error;
    }),
  );
  initializeAgentPreferences(client);
  initializeBrowserPermissions(
    (
      globalThis as typeof globalThis & {
        chrome?: {
          permissions: Parameters<typeof initializeBrowserPermissions>[0];
        };
      }
    ).chrome?.permissions,
  );
  const management = initializeProviderManagement(client, loadProviderForm);
  initializeProviderSave(client, management);
  for (const form of document.querySelectorAll<HTMLFormElement>("form"))
    form.addEventListener("submit", (event) => {
      if (event.defaultPrevented) return;
      event.preventDefault();
      show("이 설정 기능은 아직 Backend에 연결되지 않았습니다.");
    });
  for (const id of ["provider-test", "provider-models-load"])
    document
      .getElementById(id)
      ?.addEventListener("click", () =>
        show("이 연결 확인 기능은 아직 Backend에 연결되지 않았습니다."),
      );
}
