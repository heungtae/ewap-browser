import type { SettingsClient, TaskClient } from "@contextpilot/shared/bridge";
import type { PresentationView } from "./view.js";
export function mountPresentation(
  document: Document,
  view: PresentationView,
  tasks: TaskClient,
  settings: SettingsClient,
): () => void {
  const submit = (event: Event) => {
    event.preventDefault();
    // S28 has no task admission capability. Never create a second executor.
    view.status("Backend task admission is not available yet");
  };
  const forms = [...document.querySelectorAll("form")];
  forms.forEach((form) => form.addEventListener("submit", submit));
  void settings
    .read()
    .then((value) => {
      view.status(
        value.controllerReady
          ? "Backend connected"
          : "Controller unavailable — setup required",
      );
    })
    .catch(() =>
      view.status("Backend missing — install or repair the local host"),
    );
  void tasks
    .resume(0)
    .then((result) => {
      if (result.resync) view.status("Backend snapshot required — waiting");
      else
        for (const event of result.events)
          if (event.kind === "message" && event.text !== undefined)
            view.message(event.text);
    })
    .catch(() =>
      view.status("Backend disconnected — waiting for reconnection"),
    );
  return () =>
    forms.forEach((form) => form.removeEventListener("submit", submit));
}
