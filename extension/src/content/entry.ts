import { digestCanonical } from "../security/canonical.js";

type BrowserRuntime = {
  id: string;
  getURL(path: string): string;
  sendMessage(message: unknown): Promise<unknown>;
  onMessage: {
    addListener(
      listener: (
        message: unknown,
        sender: { id?: string; url?: string },
        respond: (response: unknown) => void,
      ) => boolean | void,
    ): void;
  };
};
type ExecuteIntent = {
  tool:
    | "set_text_by_ref"
    | "select_option_by_ref"
    | "set_checked_by_ref"
    | "click_by_ref"
    | "press_key_by_ref";
  run_id: string;
  tab_id: number;
  frame_id: number;
  document_epoch: string;
  ref_id: string;
  profile: { id: string; version: number };
  value_binding?: {
    value_slot_id: string;
    value_kind: "text" | "option";
    value_digest: string;
  };
  argument?: { checked?: boolean; key?: "Enter" | "Space" | "Escape" };
};
const runtime = (
  globalThis as typeof globalThis & { chrome?: { runtime: BrowserRuntime } }
).chrome?.runtime;
const supportedRoles = new Set([
  "button",
  "checkbox",
  "combobox",
  "heading",
  "link",
  "option",
  "radio",
  "textbox",
  "listbox",
  "tab",
  "menuitem",
  "dialog",
  "alert",
  "status",
  "navigation",
  "main",
  "form",
]);
const base64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
const epochBytes = new Uint8Array(18);
crypto.getRandomValues(epochBytes);
const documentEpoch = base64Url(epochBytes);
const refs = new WeakMap<Element, string>();
const consumedDeliveries = new Set<string>();
type RefRecord = {
  element: Element;
  role: string;
  name: string;
  stale: boolean;
};
const refRecords = new Map<string, RefRecord>();
type BoundedTargetRequest = {
  kind: "PREPARE_BOUNDED_CDP_TARGET" | "CLEAR_BOUNDED_CDP_TARGET";
  run_id: string;
  action_id: string;
  tab_id: number;
  frame_id: number;
  document_id: string;
  document_epoch: string;
  ref_id: string;
  action_token: string;
};
const actionTokenPattern = /^[A-Za-z0-9_-]{22,128}$/;
const boundedMarkers = new Map<string, HTMLElement>();
const pageDevToolsLabels = new Set([
  "[ContextPilot][LLM request final]",
  "[ContextPilot][LLM response final]",
]);
const boundedTarget = (
  request: BoundedTargetRequest,
): HTMLElement | undefined => {
  if (
    request.document_epoch !== documentEpoch ||
    request.frame_id !== 0 ||
    !actionTokenPattern.test(request.action_token)
  )
    return undefined;
  const record = refRecords.get(request.ref_id);
  const element = record?.element;
  if (
    !record ||
    record.stale ||
    !(element instanceof HTMLElement) ||
    !element.isConnected ||
    roleFor(element) !== record.role ||
    nameFor(element) !== record.name ||
    isSensitiveElement(element) ||
    !element.matches(":not([disabled])")
  )
    return undefined;
  const style = getComputedStyle(element);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    element.getClientRects().length === 0
  )
    return undefined;
  return element;
};
const isSensitiveElement = (element: Element): boolean =>
  (element instanceof HTMLInputElement &&
    (element.type === "password" ||
      /password|secret|otp|mfa|인증|비밀번호|token|recovery/i.test(
        nameFor(element),
      ) ||
      /one-time-code/i.test(element.autocomplete))) ||
  /password|secret|otp|mfa|인증|비밀번호|token|recovery/i.test(
    nameFor(element),
  );
const refFor = (element: Element, role: string, name: string): string => {
  const existing = refs.get(element);
  if (existing) {
    const record = refRecords.get(existing);
    if (record && !record.stale && record.role === role && record.name === name)
      return existing;
    refs.delete(element);
  }
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const ref = base64Url(bytes);
  refs.set(element, ref);
  refRecords.set(ref, { element, role, name, stale: false });
  return ref;
};
const roleFor = (element: Element): string | undefined => {
  const aria = element.getAttribute("role");
  if (aria && supportedRoles.has(aria)) return aria;
  if (element instanceof HTMLButtonElement) return "button";
  if (element instanceof HTMLInputElement)
    return element.type === "checkbox"
      ? "checkbox"
      : element.type === "radio"
        ? "radio"
        : element.type === "password"
          ? undefined
          : "textbox";
  if (element instanceof HTMLTextAreaElement) return "textbox";
  if (element instanceof HTMLSelectElement) return "combobox";
  if (element instanceof HTMLAnchorElement) return "link";
  const heading = /^H[1-6]$/.test(element.tagName);
  return heading ? "heading" : undefined;
};
const nameFor = (element: Element): string => {
  const labelledBy = element.getAttribute("aria-labelledby");
  const labelled = labelledBy
    ? labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ")
    : "";
  const nativeLabel =
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
      ? [...(element.labels ?? [])]
          .map((label) => label.textContent ?? "")
          .join(" ")
      : "";
  const candidate =
    element.getAttribute("aria-label") ||
    labelled ||
    nativeLabel ||
    element.textContent ||
    "";
  return candidate
    .split("")
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? " " : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
};
const invalidateAffectedRefs = (target: Node): void => {
  for (const record of refRecords.values()) {
    if (
      record.element === target ||
      record.element.contains(target) ||
      (!record.element.isConnected && target.isConnected)
    ) {
      record.stale = true;
      refs.delete(record.element);
    }
  }
};
new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    invalidateAffectedRefs(mutation.target);
    for (const node of mutation.removedNodes) invalidateAffectedRefs(node);
  }
}).observe(document, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: [
    "aria-label",
    "aria-labelledby",
    "role",
    "disabled",
    "aria-expanded",
    "required",
    "type",
    "autocomplete",
  ],
});
const visiblePageText = (): string => {
  const raw = document.body?.innerText ?? "";
  const lines = raw
    .split(/\r?\n/)
    .map((line) =>
      line
        .split("")
        .map((character) => {
          const code = character.charCodeAt(0);
          return code <= 31 || code === 127 ? " " : character;
        })
        .join("")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  let result = "";
  for (const line of lines) {
    const next = result ? `${result}\n${line}` : line;
    if ([...next].length > 12_000) break;
    result = next;
  }
  return result;
};
const normalizePageText = (value: string, maxCharacters: number): string => {
  let result = "";
  for (const line of value.split(/\r?\n/)) {
    const normalized = line
      .split("")
      .map((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127 ? " " : character;
      })
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) continue;
    const next = result ? `${result}\n${normalized}` : normalized;
    if ([...next].length > maxCharacters) break;
    result = next;
  }
  return result;
};
const articlePageText = (): string => {
  const candidates = [
    ...document.querySelectorAll<HTMLElement>("article,main,[role=main]"),
  ].filter((element) => hiddenReasonFor(element) === undefined);
  const best = candidates
    .map((element) => normalizePageText(element.innerText, 50_000))
    .sort((left, right) => right.length - left.length)[0];
  return best ?? "";
};
type ReadScope = "all_dom" | "visible_only" | "interactive";
const interactiveRoles = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "radio",
  "textbox",
  "tab",
  "menuitem",
]);
const hiddenReasonFor = (element: Element): string | undefined => {
  let current: Element | null = element;
  while (current) {
    if (current.getAttribute("aria-hidden") === "true")
      return current === element ? "aria_hidden" : "ancestor_hidden";
    const style = getComputedStyle(current);
    if (style.display === "none")
      return current === element ? "display_none" : "ancestor_hidden";
    if (style.visibility === "hidden" || style.visibility === "collapse")
      return current === element ? "visibility_hidden" : "ancestor_hidden";
    if (Number(style.opacity) === 0)
      return current === element ? "opacity_zero" : "ancestor_hidden";
    current = current.parentElement;
  }
  if (element.closest("details:not([open])")) return "collapsed";
  const rects = element.getClientRects();
  if (rects.length === 0) return "zero_box";
  const rect = rects[0];
  if (
    rect &&
    (rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth)
  )
    return "outside_viewport";
  return undefined;
};
const projection = (scope: ReadScope = "all_dom"): unknown => ({
  origin: location.origin,
  snapshot: {
    schema_version: 2,
    document_epoch: documentEpoch,
    frame_id: 0,
    scope,
    truncated: false,
    visible_text: visiblePageText(),
    article_text: articlePageText(),
    nodes: [
      ...document.querySelectorAll(
        "button,input,textarea,select,a,[role],h1,h2,h3,h4,h5,h6",
      ),
    ]
      .flatMap((element) => {
        const role = roleFor(element);
        const name = nameFor(element);
        const hiddenReason = hiddenReasonFor(element);
        const visible = hiddenReason === undefined;
        const sensitive =
          element instanceof HTMLInputElement &&
          (element.type === "password" ||
            element.type === "hidden" ||
            /password|secret|otp|mfa|인증|비밀번호/i.test(name) ||
            /one-time-code/i.test(element.autocomplete));
        if (
          !role ||
          sensitive ||
          (scope === "visible_only" && !visible) ||
          (scope === "interactive" && (!visible || !interactiveRoles.has(role)))
        )
          return [];
        const state = {
          ...(element.hasAttribute("disabled") ? { disabled: true } : {}),
          ...(element instanceof HTMLInputElement &&
          (element.type === "checkbox" || element.type === "radio")
            ? { checked: element.checked }
            : {}),
          ...(element instanceof HTMLSelectElement
            ? { selected: element.selectedIndex >= 0 }
            : {}),
          ...(element.hasAttribute("aria-expanded")
            ? { expanded: element.getAttribute("aria-expanded") === "true" }
            : {}),
          ...(element.hasAttribute("required") ? { required: true } : {}),
        };
        return [
          {
            ref_id: refFor(element, role, name),
            role,
            name,
            state,
            visible,
            visibility: visible ? "visible" : "hidden",
            ...(!visible && hiddenReason
              ? { hidden_reason: hiddenReason }
              : {}),
            enabled:
              !(
                element instanceof HTMLButtonElement ||
                element instanceof HTMLInputElement ||
                element instanceof HTMLSelectElement ||
                element instanceof HTMLTextAreaElement
              ) || !element.disabled,
          },
        ];
      })
      .slice(0, 5_000),
  },
});
runtime?.onMessage.addListener((message, sender, respond) => {
  if (
    typeof message === "object" &&
    message !== null &&
    (message as { kind?: unknown }).kind === "CONTENT_EXECUTE_R1" &&
    (["click_by_ref", "press_key_by_ref"] as const).includes(
      (message as { intent?: ExecuteIntent }).intent?.tool as
        | "click_by_ref"
        | "press_key_by_ref",
    )
  ) {
    const request = message as {
      intent?: ExecuteIntent;
      value_delivery?: unknown;
    };
    const intent = request.intent;
    if (
      sender.id !== runtime.id ||
      sender.url !== runtime.getURL("js/service-worker.js") ||
      !intent ||
      intent.document_epoch !== documentEpoch ||
      request.value_delivery !== undefined
    ) {
      respond({ ok: false, code: "INVALID_ARGUMENT" });
      return true;
    }
    const record = refRecords.get(intent.ref_id);
    const element = record?.element;
    if (
      !record ||
      record.stale ||
      !(element instanceof HTMLElement) ||
      (intent.tool === "click_by_ref" &&
        (!(element instanceof HTMLButtonElement) ||
          record.role !== "button")) ||
      (intent.tool === "press_key_by_ref" &&
        !["button", "textbox", "combobox", "tab", "menuitem"].includes(
          record.role,
        )) ||
      !element.isConnected ||
      ((element instanceof HTMLButtonElement ||
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement) &&
        element.disabled) ||
      roleFor(element) !== record.role ||
      nameFor(element) !== record.name ||
      getComputedStyle(element).display === "none" ||
      getComputedStyle(element).visibility === "hidden" ||
      element.getClientRects().length === 0
    ) {
      respond({
        ok: false,
        code: record?.stale ? "TARGET_STALE" : "TARGET_NOT_ACTIONABLE",
      });
      return true;
    }
    if (intent.tool === "click_by_ref") element.click();
    else {
      const key = intent.argument?.key;
      if (!key || !["Enter", "Space", "Escape"].includes(key)) {
        respond({ ok: false, code: "TARGET_NOT_ACTIONABLE" });
        return true;
      }
      element.focus();
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true }),
      );
      element.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
    }
    respond({ ok: true, postcondition: "dispatch" });
    return true;
  }
  if (
    typeof message === "object" &&
    message !== null &&
    (message as { kind?: unknown }).kind === "CONTENT_DEVTOOLS_LOG"
  ) {
    const request = message as {
      kind?: unknown;
      level?: unknown;
      label?: unknown;
      detail?: unknown;
    };
    if (
      sender.id !== runtime.id ||
      sender.url !== runtime.getURL("js/service-worker.js") ||
      Object.keys(message).length !== 4 ||
      request.level !== "info" ||
      typeof request.label !== "string" ||
      !pageDevToolsLabels.has(request.label) ||
      typeof request.detail !== "object" ||
      request.detail === null
    ) {
      respond({ ok: false, code: "INVALID_ARGUMENT" });
      return true;
    }
    console.info(request.label, request.detail);
    respond({ ok: true });
    return true;
  }
  if (
    typeof message === "object" &&
    message !== null &&
    ((message as { kind?: unknown }).kind === "PREPARE_BOUNDED_CDP_TARGET" ||
      (message as { kind?: unknown }).kind === "CLEAR_BOUNDED_CDP_TARGET")
  ) {
    const request = message as BoundedTargetRequest;
    if (
      sender.id !== runtime.id ||
      sender.url !== runtime.getURL("js/service-worker.js") ||
      request.tab_id === undefined ||
      request.document_id === undefined ||
      request.frame_id !== 0
    ) {
      respond({ ok: false, code: "INVALID_ARGUMENT" });
      return true;
    }
    const markerKey = `${request.run_id}:${request.action_id}`;
    if (request.kind === "CLEAR_BOUNDED_CDP_TARGET") {
      const marked = boundedMarkers.get(markerKey);
      if (
        marked?.getAttribute("data-contextpilot-action-token") ===
        request.action_token
      )
        marked.removeAttribute("data-contextpilot-action-token");
      boundedMarkers.delete(markerKey);
      respond({ ok: true });
      return true;
    }
    const element = boundedTarget(request);
    if (!element) {
      respond({ ok: false, code: "TARGET_NOT_ACTIONABLE" });
      return true;
    }
    if (boundedMarkers.has(markerKey)) {
      respond({ ok: false, code: "TARGET_NOT_ACTIONABLE" });
      return true;
    }
    element.setAttribute(
      "data-contextpilot-action-token",
      request.action_token,
    );
    boundedMarkers.set(markerKey, element);
    respond({
      ok: true,
      unique: true,
      sensitive: false,
      stale: false,
      visible: true,
      enabled: true,
      occluded: false,
    });
    return true;
  }
  if (
    typeof message === "object" &&
    message !== null &&
    (message as { kind?: unknown }).kind === "CONTENT_EXECUTE_R1" &&
    ((message as { intent?: ExecuteIntent }).intent?.tool ===
      "select_option_by_ref" ||
      (message as { intent?: ExecuteIntent }).intent?.tool ===
        "set_checked_by_ref")
  ) {
    const request = message as {
      intent?: ExecuteIntent;
      value_delivery?: {
        value_slot_id?: unknown;
        value_kind?: unknown;
        value?: unknown;
      };
    };
    const intent = request.intent!;
    const delivery = request.value_delivery;
    if (
      sender.id !== runtime.id ||
      sender.url !== runtime.getURL("js/service-worker.js") ||
      intent.document_epoch !== documentEpoch
    ) {
      respond({ ok: false, code: "INVALID_ARGUMENT" });
      return true;
    }
    const record = refRecords.get(intent.ref_id);
    const element = record?.element;
    if (
      !record ||
      record.stale ||
      !element?.isConnected ||
      roleFor(element) !== record.role ||
      nameFor(element) !== record.name ||
      (element instanceof HTMLInputElement && element.disabled) ||
      (element instanceof HTMLSelectElement && element.disabled) ||
      getComputedStyle(element).display === "none" ||
      getComputedStyle(element).visibility === "hidden" ||
      element.getClientRects().length === 0
    ) {
      respond({ ok: false, code: "TARGET_STALE" });
      return true;
    }
    if (intent.tool === "select_option_by_ref") {
      if (
        !(element instanceof HTMLSelectElement) ||
        record.role !== "combobox" ||
        !intent.value_binding ||
        !delivery ||
        delivery.value_kind !== "option" ||
        typeof delivery.value_slot_id !== "string" ||
        typeof delivery.value !== "string" ||
        delivery.value_slot_id !== intent.value_binding.value_slot_id ||
        consumedDeliveries.has(delivery.value_slot_id) ||
        intent.value_binding.value_digest !==
          digestCanonical({
            schema_version: 1,
            run_id: intent.run_id,
            tab_id: intent.tab_id,
            frame_id: intent.frame_id,
            document_epoch: intent.document_epoch,
            profile_id: intent.profile.id,
            profile_version: intent.profile.version,
            tool: intent.tool,
            ref_id: intent.ref_id,
            value_slot_id: delivery.value_slot_id,
            value_kind: delivery.value_kind,
            value: delivery.value,
          })
      ) {
        respond({ ok: false, code: "VALUE_BINDING_INVALID" });
        return true;
      }
      const option = [...element.options].find(
        (candidate) => candidate.text === delivery.value,
      );
      if (!option || element.value === option.value) {
        respond({ ok: false, code: "TARGET_NOT_ACTIONABLE" });
        return true;
      }
      element.value = option.value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      if (element.value !== option.value) {
        respond({ ok: false, code: "TARGET_NOT_ACTIONABLE" });
        return true;
      }
      consumedDeliveries.add(delivery.value_slot_id);
      respond({ ok: true, postcondition: "semantic" });
      return true;
    }
    if (
      !(element instanceof HTMLInputElement) ||
      (element.type !== "checkbox" && element.type !== "radio") ||
      record.role !== "checkbox" ||
      typeof intent.argument?.checked !== "boolean" ||
      element.checked === intent.argument.checked ||
      delivery !== undefined
    ) {
      respond({ ok: false, code: "TARGET_NOT_ACTIONABLE" });
      return true;
    }
    element.click();
    if (element.checked !== intent.argument.checked) {
      respond({ ok: false, code: "TARGET_NOT_ACTIONABLE" });
      return true;
    }
    respond({ ok: true, postcondition: "semantic" });
    return true;
  }
  if (
    typeof message === "object" &&
    message !== null &&
    (message as { kind?: unknown }).kind === "CONTENT_EXECUTE_R1"
  ) {
    const request = message as {
      intent?: ExecuteIntent;
      value_delivery?: {
        value_slot_id?: unknown;
        value_kind?: unknown;
        value?: unknown;
      };
    };
    const intent = request.intent;
    const delivery = request.value_delivery;
    if (
      sender.id !== runtime.id ||
      sender.url !== runtime.getURL("js/service-worker.js")
    ) {
      respond({ ok: false, code: "INVALID_ARGUMENT" });
      return true;
    }
    if (
      !intent ||
      intent.tool !== "set_text_by_ref" ||
      intent.document_epoch !== documentEpoch ||
      !intent.value_binding ||
      !delivery ||
      delivery.value_kind !== "text" ||
      typeof delivery.value_slot_id !== "string" ||
      typeof delivery.value !== "string" ||
      delivery.value_slot_id !== intent.value_binding.value_slot_id ||
      consumedDeliveries.has(delivery.value_slot_id)
    ) {
      respond({ ok: false, code: "VALUE_BINDING_INVALID" });
      return true;
    }
    if (
      intent.value_binding.value_digest !==
      digestCanonical({
        schema_version: 1,
        run_id: intent.run_id,
        tab_id: intent.tab_id,
        frame_id: intent.frame_id,
        document_epoch: intent.document_epoch,
        profile_id: intent.profile.id,
        profile_version: intent.profile.version,
        tool: intent.tool,
        ref_id: intent.ref_id,
        value_slot_id: delivery.value_slot_id,
        value_kind: delivery.value_kind,
        value: delivery.value,
      })
    ) {
      respond({ ok: false, code: "VALUE_BINDING_INVALID" });
      return true;
    }
    const record = refRecords.get(intent.ref_id);
    const element = record?.element;
    if (
      !record ||
      record.stale ||
      !element?.isConnected ||
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) ||
      roleFor(element) !== record.role ||
      nameFor(element) !== record.name ||
      element.disabled ||
      element.type === "password"
    ) {
      respond({ ok: false, code: "TARGET_STALE" });
      return true;
    }
    const style = getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      element.getClientRects().length === 0 ||
      element.value === delivery.value
    ) {
      respond({ ok: false, code: "TARGET_NOT_ACTIONABLE" });
      return true;
    }
    const setter = Object.getOwnPropertyDescriptor(
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    if (!setter) {
      respond({ ok: false, code: "TARGET_NOT_ACTIONABLE" });
      return true;
    }
    setter.call(element, delivery.value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    if (element.value !== delivery.value) {
      respond({ ok: false, code: "TARGET_NOT_ACTIONABLE" });
      return true;
    }
    consumedDeliveries.add(delivery.value_slot_id);
    respond({ ok: true, postcondition: "semantic" });
    return true;
  }
  if (
    typeof message === "object" &&
    message !== null &&
    (message as { kind?: unknown }).kind === "CONTENT_SNAPSHOT"
  ) {
    const scope = (message as { scope?: unknown }).scope;
    if (
      scope !== undefined &&
      scope !== "all_dom" &&
      scope !== "visible_only" &&
      scope !== "interactive"
    ) {
      respond({ ok: false, code: "INVALID_ARGUMENT" });
      return true;
    }
    void registerDocument().then((registered) => {
      if (!registered) {
        respond({ ok: false, code: "DOCUMENT_NOT_REGISTERED" });
        return;
      }
      const result = projection((scope as ReadScope | undefined) ?? "all_dom");
      const snapshot = (
        result as { snapshot: Record<string, unknown> & { nodes: unknown[] } }
      ).snapshot;
      snapshot.node_count = snapshot.nodes.length;
      respond({ ok: true, snapshot: result });
    });
    return true;
  }
  return undefined;
});
const registerDocument = async (attempt = 0): Promise<boolean> => {
  try {
    const result = await runtime?.sendMessage({
      schema_version: 1,
      kind: "DOCUMENT_REGISTER",
      document_epoch: documentEpoch,
    });
    if (typeof result === "object" && result !== null) {
      if ((result as { ok?: unknown }).ok === true) return true;
      if (
        attempt < 20 &&
        (result as { code?: unknown }).code === "STORAGE_BOUNDARY_UNAVAILABLE"
      ) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
        return registerDocument(attempt + 1);
      }
    }
  } catch {
    // The worker can be suspended while this document is still live. A later
    // snapshot request re-registers before releasing a document identity.
  }
  return false;
};
void registerDocument();
