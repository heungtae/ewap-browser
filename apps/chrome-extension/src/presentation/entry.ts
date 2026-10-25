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
const state = { cursor: 0, snapshotRequired: false };
let dispose: (() => void) | undefined;
const mount = () => {
  dispose ??= mountPresentation(
    document,
    createView(document),
    tasks,
    settings,
    state,
  );
};
window.addEventListener("pagehide", () => {
  dispose?.();
  dispose = undefined;
});
window.addEventListener("pageshow", mount);
mount();
