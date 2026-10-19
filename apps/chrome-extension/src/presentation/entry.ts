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
mountPresentation(document, createView(document), tasks, settings);
