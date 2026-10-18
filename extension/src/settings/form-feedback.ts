const dirtyForms = new WeakSet<HTMLFormElement>();
export const markFormSaved = (form: HTMLFormElement | null): void => {
  if (!form) return;
  dirtyForms.delete(form);
  const state = form.querySelector<HTMLElement>(".form-save-state");
  if (state) state.textContent = "";
};
export const isFormDirty = (form: HTMLFormElement | null): boolean =>
  !!form && dirtyForms.has(form);
export const initializeFormFeedback = (): void => {
  for (const form of document.querySelectorAll<HTMLFormElement>("form")) {
    const state = document.createElement("span");
    state.className = "form-save-state";
    state.setAttribute("role", "status");
    form.append(state);
    const changed = (event: Event) => {
      const target = event.target as HTMLInputElement;
      if (
        target.id === "content-recovery-enable" ||
        target.id === "provider-test-messages"
      )
        return;
      dirtyForms.add(form);
      state.textContent = "저장하지 않은 변경사항이 있습니다.";
    };
    form.addEventListener("input", changed);
    form.addEventListener("change", changed);
    form.addEventListener("settings-saved", () => markFormSaved(form));
  }
  window.addEventListener("beforeunload", (event) => {
    if ([...document.forms].some((form) => dirtyForms.has(form))) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
};
