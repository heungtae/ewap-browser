import { digestCanonical } from "../security/canonical.js";

// Only native dialog transitions and explicit, same-document ARIA status
// relations qualify. This observes local UI, never business success.
export const createUiCompletionObserver = (dependencies: {
  epoch(): string;
  resolve(ref: string): HTMLElement | undefined;
}) => {
  type Observation = {
    source: HTMLElement;
    target: HTMLElement;
    relation: string | null;
    url: string;
    epoch: string;
    expires: number;
    baseline: string;
    kind: "status" | "open" | "close";
  };
  const observations = new Map<string, Observation>();
  const statusText = (target: HTMLElement): string => {
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
    let text = "";
    let visited = 0;
    for (
      let node = walker.nextNode();
      node && text.length < 4096 && visited++ < 1000;
      node = walker.nextNode()
    ) {
      if (
        !node.parentElement?.closest("script,style,[hidden],[aria-hidden=true]")
      )
        text += (node.nodeValue ?? "").slice(0, 4096 - text.length);
    }
    return text;
  };
  const digest = (target: HTMLElement): string =>
    digestCanonical(statusText(target));
  const visible = (target: HTMLElement): boolean => {
    if (target.getClientRects().length === 0) return false;
    for (
      let element: HTMLElement | null = target;
      element;
      element = element.parentElement
    ) {
      const style = getComputedStyle(element);
      if (
        element.hidden ||
        element.getAttribute("aria-hidden") === "true" ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse" ||
        Number(style.opacity) === 0
      )
        return false;
    }
    return true;
  };
  const handle = (
    message: Record<string, unknown>,
  ): Record<string, unknown> => {
    const key = message.run_id;
    if (
      typeof key !== "string" ||
      key.length > 128 ||
      message.document_epoch !== dependencies.epoch()
    )
      return { ok: false };
    for (const [id, observation] of observations)
      if (observation.expires < Date.now()) observations.delete(id);
    if (message.kind === "CONTENT_RELEASE_UI_COMPLETION") {
      observations.delete(key);
      return { ok: true };
    }
    if (message.kind === "CONTENT_PREPARE_UI_COMPLETION") {
      if (
        observations.has(key) ||
        observations.size >= 32 ||
        typeof message.ref_id !== "string"
      )
        return { ok: false };
      const source = dependencies.resolve(message.ref_id);
      if (!source) return { ok: false };
      const relation = source.getAttribute("aria-controls");
      let target: HTMLElement | undefined;
      let kind: Observation["kind"] | undefined;
      const form = source instanceof HTMLButtonElement ? source.form : null;
      const dialog = source.closest("dialog");
      if (
        form?.method === "dialog" &&
        source instanceof HTMLButtonElement &&
        source.type === "submit" &&
        dialog instanceof HTMLDialogElement &&
        dialog.open
      ) {
        target = dialog;
        kind = "close";
      } else if (relation && /^[A-Za-z][\w:-]{0,127}$/.test(relation)) {
        const matches = document.querySelectorAll(`[id="${relation}"]`);
        if (matches.length !== 1 || !(matches[0] instanceof HTMLElement))
          return { ok: false };
        target = matches[0];
        if (
          target instanceof HTMLDialogElement &&
          !target.open &&
          source.getAttribute("aria-haspopup") === "dialog"
        )
          kind = "open";
        else if (
          ["status", "alert"].includes(target.getAttribute("role") ?? "") &&
          visible(target) &&
          !target.querySelector("input,textarea,select,[contenteditable]")
        )
          kind = "status";
      }
      if (!target || !kind) return { ok: false };
      observations.set(key, {
        source,
        target,
        kind,
        relation,
        url: location.href,
        epoch: dependencies.epoch(),
        expires: Date.now() + 20_000,
        baseline: digest(target),
      });
      return { ok: true };
    }
    const observation = observations.get(key);
    if (
      !observation ||
      observation.url !== location.href ||
      observation.epoch !== dependencies.epoch() ||
      !observation.source.isConnected ||
      !observation.target.isConnected ||
      observation.source.getAttribute("aria-controls") !==
        observation.relation ||
      (observation.relation !== null &&
        (() => {
          const matches = document.querySelectorAll(
            `[id="${observation.relation}"]`,
          );
          return matches.length !== 1 || matches[0] !== observation.target;
        })())
    )
      return { ok: false };
    const { target, kind } = observation;
    if (
      kind === "close" &&
      (!(observation.source instanceof HTMLButtonElement) ||
        observation.source.form?.method !== "dialog" ||
        observation.source.type !== "submit" ||
        observation.source.closest("dialog") !== target)
    )
      return { ok: false };

    const matches =
      kind === "status"
        ? ["status", "alert"].includes(target.getAttribute("role") ?? "") &&
          visible(target) &&
          !target.querySelector("input,textarea,select,[contenteditable]") &&
          !!statusText(target).trim() &&
          digest(target) !== observation.baseline
        : target instanceof HTMLDialogElement &&
          target.open === (kind === "open");
    return { ok: true, matches: !!matches };
  };
  return { handle };
};
