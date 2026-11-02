import "../bridge/schema-config.js";
import { mountPresentation } from "./controller.js";
import { createView } from "./view.js";
import { settings, tasks } from "../bridge/presentation-client.js";
import { initializeSettingsNavigation } from "./settings-navigation.js";
if (document.querySelector("[data-settings-page]"))
  initializeSettingsNavigation();
const failure = document.querySelector<HTMLSelectElement>(
  "#provider-jev-failure",
);
if (failure) {
  failure.value = "stop";
  const legacy = failure.querySelector<HTMLOptionElement>(
    'option[value="primary"]',
  );
  if (legacy) legacy.disabled = true;
}
if (document.querySelector("#provider-form")) {
  void import("./settings-entry.js").then((module) =>
    module.initializeBackendSettings(),
  );
} else if (document.querySelector("#learned-profiles")) {
  void import("./advisory-manager.js").then((module) =>
    module.initializeAdvisoryManager(),
  );
} else {
  const state = { cursor: 0, snapshotRequired: false, connectionOnly: true };
  let dispose: (() => void) | undefined;
  const view = createView(document);
  const mount = () => {
    dispose ??= mountPresentation(document, view, tasks, settings, state);
  };
  window.addEventListener("pagehide", () => {
    dispose?.();
    dispose = undefined;
  });
  window.addEventListener("pageshow", mount);
  mount();
}
