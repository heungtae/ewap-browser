import type { SettingsClient, TaskClient } from "@contextpilot/shared/bridge";
import {
  connectPresentation,
  type PresentationState,
  type PresentationClock,
} from "./connection-loop.js";
import type { PresentationView } from "./view.js";
export function mountPresentation(
  document: Document,
  view: PresentationView,
  tasks: TaskClient,
  settings: SettingsClient,
  state?: PresentationState,
  timer?: PresentationClock,
): () => void {
  const unbind = view.bind?.(tasks.panel);
  const submit = (event: Event) => {
    event.preventDefault();
    // S28 has no task admission capability. Never create a second executor.
    view.status("Backend task admission is not available yet");
  };
  const forms = unbind ? [] : [...document.querySelectorAll("form")];
  forms.forEach((form) => form.addEventListener("submit", submit));
  const disconnect = connectPresentation(view, tasks, settings, timer, state);
  return () => {
    disconnect();
    unbind?.();
    forms.forEach((form) => form.removeEventListener("submit", submit));
  };
}
