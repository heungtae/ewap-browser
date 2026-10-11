/** Checked support is deliberately limited to native inputs and ARIA buttons. */
export const readChecked = (element: Element): boolean | undefined => {
  if (element instanceof HTMLInputElement) {
    if (!["checkbox", "radio"].includes(element.type) || element.indeterminate)
      return undefined;
    return element.checked;
  }
  if (
    !(element instanceof HTMLButtonElement) ||
    !["checkbox", "radio"].includes(element.getAttribute("role") ?? "")
  )
    return undefined;
  const value = element.getAttribute("aria-checked");
  return value === "true" ? true : value === "false" ? false : undefined;
};

export const controlDisabled = (element: Element): boolean =>
  element.matches(":disabled") ||
  element.closest('[aria-disabled="true"], [inert], optgroup[disabled]') !==
    null;

export const checkedState = (element: Element): { checked?: boolean } => {
  const checked = readChecked(element);
  return checked === undefined ? {} : { checked };
};

export const executeChecked = async (
  element: HTMLElement,
  desired: boolean,
  isCurrent: () => boolean,
): Promise<
  | {
      ok: true;
      postcondition: "semantic";
      dispatch: "dispatched" | "not_dispatched";
      already_satisfied?: true;
    }
  | {
      ok: false;
      code: "TARGET_STALE" | "TARGET_NOT_ACTIONABLE";
      dispatch: "dispatched" | "not_dispatched";
    }
> => {
  const current = () => isCurrent() && element.isConnected;
  if (!current())
    return { ok: false, code: "TARGET_STALE", dispatch: "not_dispatched" };
  if (controlDisabled(element) || readChecked(element) === undefined)
    return {
      ok: false,
      code: "TARGET_NOT_ACTIONABLE",
      dispatch: "not_dispatched",
    };
  if (readChecked(element) === desired)
    return {
      ok: true,
      postcondition: "semantic",
      dispatch: "not_dispatched",
      already_satisfied: true,
    };
  const radio =
    element.getAttribute("role") === "radio" ||
    (element instanceof HTMLInputElement && element.type === "radio");
  if (radio && !desired)
    return {
      ok: false,
      code: "TARGET_NOT_ACTIONABLE",
      dispatch: "not_dispatched",
    };
  element.click();
  const deadline = Date.now() + 1500;
  do {
    if (!current())
      return { ok: false, code: "TARGET_STALE", dispatch: "dispatched" };
    if (readChecked(element) === desired)
      return { ok: true, postcondition: "semantic", dispatch: "dispatched" };
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  return { ok: false, code: "TARGET_NOT_ACTIONABLE", dispatch: "dispatched" };
};
