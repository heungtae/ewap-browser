import {
  type ChatActionView,
  type ChatEvent,
  validateChatEvent,
} from "../contracts/chat-events.js";
import { renderMarkdown } from "./markdown.js";
import { failureHelp, timelineToolLabel, userMessage } from "./panel.js";
import { redactForChat } from "../security/chat-redaction.js";

type BrowserRuntime = {
  sendMessage(message: unknown): Promise<unknown>;
  connect(info: { name: string }): {
    onMessage: { addListener(listener: (message: unknown) => void): void };
  };
  openOptionsPage(): Promise<void>;
  onMessage: { addListener(listener: (message: unknown) => void): void };
};
type BrowserTabs = {
  onActivated?: {
    addListener(
      listener: (activeInfo: { tabId: number; windowId: number }) => void,
    ): void;
  };
};
const chromeApi = (
  globalThis as typeof globalThis & {
    chrome?: {
      runtime: BrowserRuntime;
      tabs?: BrowserTabs;
    };
  }
).chrome;
const runtime = chromeApi?.runtime;
const panelPort = runtime?.connect({ name: "contextpilot-panel" });
const byId = <T extends HTMLElement>(id: string): T | null =>
  document.querySelector<T>("#" + id);
const chatForm = byId<HTMLFormElement>("chat-form");
const chatInput = byId<HTMLTextAreaElement>("chat-input");
const attachmentInput = byId<HTMLInputElement>("attachment-input");
const attachmentTrigger = byId<HTMLButtonElement>("attachment-trigger");
const attachmentName = byId<HTMLOutputElement>("attachment-name");
const chatMessages = byId<HTMLElement>("chat-messages");
const chatScroll = byId<HTMLElement>("chat-scroll");
const emptyState = byId<HTMLElement>("empty-state");
const suggestedPrompt = byId<HTMLButtonElement>("suggested-prompt");
const status = byId<HTMLElement>("status");
const send = byId<HTMLButtonElement>("chat-send");
const modeAsk = byId<HTMLButtonElement>("mode-ask");
const modeAct = byId<HTMLButtonElement>("mode-act");
const settingsOpen = byId<HTMLButtonElement>("settings-open");
const newChatOpen = byId<HTMLButtonElement>("new-chat-open");
const newChatDialog = byId<HTMLDialogElement>("new-chat-dialog");
const newChatConfirm = byId<HTMLButtonElement>("new-chat-confirm");
const newChatCancel = byId<HTMLButtonElement>("new-chat-cancel");
const permissionModeBadge = byId<HTMLElement>("permission-mode-badge");
const runBanner = byId<HTMLElement>("run-banner");
const threadScope = byId<HTMLElement>("thread-scope");

let chatMode: "ask" | "act" = "ask";
let currentPermissionMode = "standard";
let deltaFrame: number | undefined;
// `sequence` is monotonic within a tab thread. It deliberately does not
// restart for each run, so a second question begins after the first run's
// terminal event.
const threadSequences = new Map<string, number>();
const resyncingThreads = new Set<string>();
const streamingMessages = new Map<string, HTMLElement>();
const pendingDeltas = new Map<string, string>();
let assistantMessageText = new WeakMap<HTMLElement, string>();
const tools = new Map<string, HTMLElement>();
const transcriptLimit = 1_000;
const maxAttachmentBytes = 128 * 1024;
const maxAttachmentChars = 6_000;
const maxAssistantMessageChars = 16_000;
const assistantTruncationMarker = "\n\n[응답이 길어 앞부분만 표시합니다.]";
const textAttachmentExtensions = new Set(["txt", "md", "csv", "json"]);
let attachment: { name: string; text: string; truncated: boolean } | undefined;
let runActive = false;
let skipNextLiveUserMessage = false;
let activeThreadTabId: number | undefined;
let latestRecoveryId = 0;

const boundedAssistantText = (text: string): string => {
  if (text.length <= maxAssistantMessageChars) return text;
  return (
    text.slice(0, maxAssistantMessageChars - assistantTruncationMarker.length) +
    assistantTruncationMarker
  );
};
const appendAssistantText = (current: string, next: string): string =>
  current.endsWith(assistantTruncationMarker)
    ? current
    : boundedAssistantText(current + next);

const setStatus = (text: string): void => {
  if (status) status.textContent = text;
};
const openSettings = (): void => {
  if (!runtime) {
    setStatus("설정 화면을 열 수 없습니다.");
    return;
  }
  void runtime.openOptionsPage().catch(() => {
    setStatus("설정 화면을 열지 못했습니다.");
  });
};
const isNearBottom = (): boolean =>
  !!chatScroll &&
  chatScroll.scrollHeight - chatScroll.scrollTop - chatScroll.clientHeight < 40;
const append = (element: HTMLElement): void => {
  if (!chatMessages) return;
  const wasNearBottom = isNearBottom();
  emptyState?.setAttribute("hidden", "");
  chatMessages.append(element);
  while (chatMessages.children.length > transcriptLimit)
    chatMessages.firstElementChild?.remove();
  if (wasNearBottom && chatScroll)
    chatScroll.scrollTop = chatScroll.scrollHeight;
};
const message = (role: "user" | "assistant", text: string): HTMLElement => {
  const item = document.createElement("article");
  item.className = "message";
  item.dataset.role = role;
  if (role === "assistant") {
    const bounded = boundedAssistantText(text);
    assistantMessageText.set(item, bounded);
    renderMarkdown(item, bounded);
  } else item.textContent = text;
  return item;
};
const card = (
  kind:
    | "tool"
    | "review"
    | "permission"
    | "value"
    | "confirmation"
    | "error"
    | "page-scope",
  title: string,
  detail: string,
): HTMLElement => {
  const item = document.createElement("article");
  item.className = "event-card";
  item.dataset.kind = kind;
  const heading = document.createElement("div");
  heading.className = "event-heading";
  const label = document.createElement("b");
  label.textContent = title;
  const state = document.createElement("span");
  state.className = "tool-state";
  heading.append(label, state);
  const body = document.createElement("div");
  body.className = "event-detail";
  body.textContent = detail;
  item.append(heading, body);
  return item;
};
const actionRow = (item: HTMLElement): HTMLElement => {
  const row = document.createElement("div");
  row.className = "card-actions";
  item.append(row);
  return row;
};
const actionButton = (
  text: string,
  kind: "primary" | "danger" | "warning" | "",
  handler: () => void | Promise<void>,
): HTMLButtonElement => {
  const control = document.createElement("button");
  control.type = "button";
  control.textContent = text;
  control.className = kind;
  control.addEventListener("click", () => void handler());
  return control;
};
const setRunActive = (active: boolean): void => {
  runActive = active;
  if (!send) return;
  send.dataset.state = active ? "stop" : "send";
  send.type = active ? "button" : "submit";
  send.setAttribute("aria-label", active ? "중지" : "보내기");
  send.title = active ? "중지" : "보내기";
};
const renderAttachment = (): void => {
  if (!attachmentName) return;
  attachmentName.hidden = !attachment;
  attachmentName.textContent = attachment
    ? attachment.name + (attachment.truncated ? " (일부)" : "")
    : "";
};
const clearAttachment = (): void => {
  attachment = undefined;
  if (attachmentInput) attachmentInput.value = "";
  renderAttachment();
};
const clearConversation = (focusInput = false): void => {
  if (deltaFrame !== undefined) cancelAnimationFrame(deltaFrame);
  deltaFrame = undefined;
  threadSequences.clear();
  resyncingThreads.clear();
  streamingMessages.clear();
  pendingDeltas.clear();
  assistantMessageText = new WeakMap<HTMLElement, string>();
  tools.clear();
  skipNextLiveUserMessage = false;
  setRunActive(false);
  chatMessages?.replaceChildren();
  emptyState?.removeAttribute("hidden");
  runBanner?.setAttribute("hidden", "");
  clearAttachment();
  if (chatInput) {
    chatInput.value = "";
    if (focusInput) chatInput.focus();
  }
};
const attachmentPrompt = (question: string): string | undefined => {
  if (!attachment) return question || undefined;
  const prefix = question || "첨부한 파일을 분석해 주세요.";
  const prompt =
    prefix +
    '\n\n[USER_ATTACHED_TEXT_FILE name="' +
    attachment.name +
    '"]\n' +
    attachment.text +
    "\n[/USER_ATTACHED_TEXT_FILE]";
  return prompt.length <= 8_000 ? prompt : undefined;
};
const applyPermissionMode = (mode: string): void => {
  currentPermissionMode = mode;
  if (!permissionModeBadge) return;
  permissionModeBadge.dataset.mode = mode;
  permissionModeBadge.textContent =
    mode === "skip_all_permission_checks"
      ? "권한 질문 생략"
      : mode === "follow_a_plan"
        ? "계획 제한"
        : "표준 권한";
};
const showFailure = (code?: string): void => {
  const detail =
    code && code in userMessage
      ? userMessage[code as keyof typeof userMessage]
      : "작업을 안전하게 완료하지 못했습니다.";
  const help = failureHelp(code);
  const item = card("error", "작업 결과를 확인할 수 없습니다", detail);
  const guidance = document.createElement("p");
  guidance.className = "failure-guidance";
  guidance.textContent = help.guidance;
  item.append(guidance);
  if (help.openSettings)
    actionRow(item).append(
      actionButton("AI 설정 열기", "primary", openSettings),
    );
  append(item);
  setStatus(detail + " " + help.guidance);
};
const sendRuntime = async (
  payload: unknown,
): Promise<Record<string, unknown>> => {
  const response = await runtime?.sendMessage(payload);
  if (
    typeof response === "object" &&
    response !== null &&
    (response as { ok?: unknown }).ok
  )
    return response as Record<string, unknown>;
  const code =
    typeof response === "object" &&
    response !== null &&
    typeof (response as { code?: unknown }).code === "string"
      ? (response as { code: string }).code
      : "INTERNAL_FAILURE";
  throw new Error(code);
};
const actionSummary = (action: ChatActionView): string =>
  action.target_name + " 작업을 제안했습니다.";
const rejectAction = async (action: ChatActionView): Promise<void> => {
  try {
    await sendRuntime({
      kind: "ACT_REJECT",
      session_id: action.session_id,
      proposal_id: action.proposal_id,
    });
    setStatus("작업을 중단했습니다.");
  } catch (error) {
    showFailure(error instanceof Error ? error.message : undefined);
  } finally {
    // A Side Panel port notification can be missed while this decision is in
    // flight. Reconcile the durable, sequenced timeline instead of waiting
    // for a later window-focus event to make the terminal result visible.
    void recoverChatEvents();
  }
};
const approveAction = async (action: ChatActionView): Promise<void> => {
  try {
    await sendRuntime({
      kind: "ACT_APPROVE",
      session_id: action.session_id,
      proposal_id: action.proposal_id,
    });
  } catch (error) {
    showFailure(error instanceof Error ? error.message : undefined);
  } finally {
    // See rejectAction: the result must be rendered without requiring the
    // user to focus the transcript.
    void recoverChatEvents();
  }
};
const renderReview = (action: ChatActionView): void => {
  const item = card("review", "작업 제안", actionSummary(action));
  const row = actionRow(item);
  let selected = false;
  const selectDecision = (decision: "approve" | "reject"): void => {
    if (selected) return;
    selected = true;
    for (const control of row.querySelectorAll<HTMLButtonElement>("button"))
      control.disabled = true;
    item.dataset.decision = decision;
    row.setAttribute("aria-busy", "true");
    if (chatScroll) chatScroll.scrollTop = chatScroll.scrollHeight;
    setStatus(
      decision === "approve"
        ? "제안을 실행하는 중입니다."
        : "작업을 중단하는 중입니다.",
    );
    // Start recovery immediately as well as after the runtime reply. This
    // covers the early tool-started event during a longer Act execution.
    void recoverChatEvents();
    void (decision === "approve"
      ? approveAction(action)
      : rejectAction(action));
  };
  if (currentPermissionMode === "follow_a_plan" && action.origin)
    row.append(
      actionButton("도메인 계획 승인", "warning", async () => {
        try {
          await sendRuntime({
            kind: "PLAN_APPROVE",
            run_id: action.session_id,
            origins: [action.origin],
          });
          setStatus("현재 도메인을 이번 실행 계획에 승인했습니다.");
        } catch (error) {
          showFailure(error instanceof Error ? error.message : undefined);
        }
      }),
    );
  row.append(
    actionButton("제안 실행", "primary", () => selectDecision("approve")),
    actionButton("중단", "danger", () => selectDecision("reject")),
  );
  append(item);
  setStatus("작업 제안을 검토해 주세요.");
};
const renderPermission = (
  requestId: string,
  action: ChatActionView,
  capability: string,
  host: string,
): void => {
  const operation =
    capability === "type"
      ? "입력"
      : capability === "navigate"
        ? "화면 전환"
        : "클릭";
  const item = card(
    "permission",
    "권한 확인",
    host + "에서 " + operation + " 작업을 허용할까요?",
  );
  const decide = async (
    decision: "once" | "always" | "deny",
  ): Promise<void> => {
    try {
      await sendRuntime({
        kind: "PERMISSION_DECISION",
        permission_request_id: requestId,
        decision,
      });
      if (decision === "deny") await rejectAction(action);
      else await approveAction(action);
    } catch (error) {
      showFailure(error instanceof Error ? error.message : undefined);
    }
  };
  const row = actionRow(item);
  row.append(
    actionButton("이번만 허용", "primary", () => decide("once")),
    actionButton("항상 허용", "", () => decide("always")),
    actionButton("거부", "danger", () => decide("deny")),
  );
  append(item);
  setStatus("실행 권한이 필요합니다.");
};
const renderValue = (
  action: ChatActionView,
  valueKind: "text" | "option",
): void => {
  const label = valueKind === "option" ? "옵션" : "값";
  const item = card(
    "value",
    "값 입력",
    action.target_name + "에 적용할 " + label + "을 확인해 주세요.",
  );
  const form = document.createElement("form");
  form.className = "value-form";
  const input = document.createElement("input");
  input.required = true;
  input.maxLength = 16_384;
  input.autocomplete = "off";
  input.placeholder = "값을 입력하세요.";
  const submit = document.createElement("button");
  submit.className = "primary";
  submit.textContent = "적용";
  form.append(input, submit);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!input.value) return;
    submit.disabled = true;
    void sendRuntime({
      kind: "ACT_VALUE_SUBMIT",
      session_id: action.session_id,
      proposal_id: action.proposal_id,
      value: input.value,
    })
      .catch((error: unknown) =>
        showFailure(error instanceof Error ? error.message : undefined),
      )
      .finally(() => {
        submit.disabled = false;
      });
  });
  item.append(form);
  append(item);
  input.focus();
  setStatus("입력값을 확인한 뒤 적용해 주세요.");
};
const renderConfirmation = (
  action: ChatActionView,
  confirmationId: string,
  confirmationNonce: string,
): void => {
  const item = card(
    "confirmation",
    "중요 작업 확인",
    action.target_name + " 작업은 추가 확인이 필요합니다.",
  );
  const row = actionRow(item);
  row.append(
    actionButton("확인하고 실행", "primary", async () => {
      try {
        await sendRuntime({
          kind: "ACT_CONFIRM",
          session_id: action.session_id,
          proposal_id: action.proposal_id,
          confirmation_id: confirmationId,
          confirmation_nonce: confirmationNonce,
        });
      } catch (error) {
        showFailure(error instanceof Error ? error.message : undefined);
      }
    }),
    actionButton("중단", "danger", () => rejectAction(action)),
  );
  append(item);
  setStatus("중요 작업을 확인해 주세요.");
};
const flushDeltas = (): void => {
  deltaFrame = undefined;
  for (const [runId, text] of pendingDeltas) {
    const previous = streamingMessages.get(runId);
    if (previous) {
      const existing = assistantMessageText.get(previous) ?? "";
      const content = appendAssistantText(existing, text);
      if (content === existing) continue;
      assistantMessageText.set(previous, content);
      renderMarkdown(previous, content);
    } else {
      const item = message("assistant", text);
      streamingMessages.set(runId, item);
      append(item);
    }
  }
  pendingDeltas.clear();
};
const applyChatEvent = (raw: unknown): void => {
  let event: ChatEvent;
  try {
    event = validateChatEvent(raw);
  } catch {
    return;
  }
  const previous = threadSequences.get(event.thread_id) ?? 0;
  if (event.sequence <= previous) return;
  if (event.sequence > previous + 1) {
    if (!resyncingThreads.has(event.thread_id)) {
      resyncingThreads.add(event.thread_id);
      void runtime
        ?.sendMessage({
          kind: "CHAT_RESYNC",
          run_id: event.run_id,
          sequence: previous,
        })
        .then((response) => {
          if (
            typeof response === "object" &&
            response !== null &&
            (response as { ok?: unknown }).ok &&
            Array.isArray((response as { events?: unknown }).events)
          )
            for (const missing of (response as { events: unknown[] }).events)
              applyChatEvent(missing);
        })
        .finally(() => resyncingThreads.delete(event.thread_id));
    }
    return;
  }
  threadSequences.set(event.thread_id, event.sequence);
  if (event.type === "user_message") {
    if (skipNextLiveUserMessage) {
      skipNextLiveUserMessage = false;
      return;
    }
    append(message("user", event.text));
    return;
  }
  if (event.type === "page_scope_changed") {
    append(
      card(
        "page-scope",
        "페이지가 변경됨",
        "페이지가 변경되어 이전 페이지 근거가 만료되었습니다.",
      ),
    );
    return;
  }
  if (event.type === "run_started") {
    applyPermissionMode(event.permission_mode);
    if (runBanner) {
      runBanner.textContent =
        event.permission_mode === "skip_all_permission_checks"
          ? "권한 질문은 생략되지만 credential, 위험 확인과 정책 차단은 계속 적용됩니다."
          : event.mode === "act"
            ? "페이지 작업을 안전하게 준비하는 중입니다."
            : "현재 페이지 정보를 안전하게 읽는 중입니다.";
      runBanner.hidden = false;
    }
    setRunActive(true);
    setStatus("응답을 생성하는 중입니다.");
    return;
  }
  if (event.type === "assistant_delta") {
    pendingDeltas.set(
      event.run_id,
      (pendingDeltas.get(event.run_id) ?? "") + event.text,
    );
    if (deltaFrame === undefined)
      deltaFrame = requestAnimationFrame(flushDeltas);
    return;
  }
  if (event.type === "tool_started") {
    flushDeltas();
    const existing = tools.get(event.tool_use_id);
    if (existing) {
      const detail = existing.querySelector<HTMLElement>(".event-detail");
      if (detail) detail.textContent = event.summary;
      return;
    }
    const item = card("tool", timelineToolLabel(event.tool), event.summary);
    tools.set(event.tool_use_id, item);
    append(item);
    return;
  }
  if (event.type === "tool_progress") {
    const item = tools.get(event.tool_use_id);
    const detail = item?.querySelector<HTMLElement>(".event-detail");
    if (detail) detail.textContent = event.summary;
    return;
  }
  if (event.type === "tool_finished") {
    const item = tools.get(event.tool_use_id);
    const detail = item?.querySelector<HTMLElement>(".event-detail");
    if (detail) detail.textContent = event.result.summary;
    const state = item?.querySelector<HTMLElement>(".tool-state");
    if (state) {
      state.dataset.outcome = event.result.outcome;
      state.textContent =
        event.result.outcome === "VERIFIED"
          ? "완료"
          : event.result.outcome === "UNKNOWN"
            ? "다시 읽기 필요"
            : "실패";
    }
    return;
  }
  if (event.type === "action_review_required")
    return renderReview(event.action);
  if (event.type === "permission_required")
    return renderPermission(
      event.request_id,
      event.action,
      event.capability,
      event.host,
    );
  if (event.type === "value_required")
    return renderValue(event.action, event.value_kind);
  if (event.type === "confirmation_required")
    return renderConfirmation(
      event.action,
      event.confirmation_id,
      event.confirmation_nonce,
    );
  flushDeltas();
  streamingMessages.delete(event.run_id);
  if (runBanner) runBanner.hidden = true;
  setRunActive(false);
  if (event.outcome === "VERIFIED") setStatus("작업을 완료했습니다.");
  else if (event.outcome === "CANCELLED") setStatus("작업을 중단했습니다.");
  else showFailure(event.code);
};
const selectThread = (tabId: number): void => {
  if (activeThreadTabId === tabId) return;
  activeThreadTabId = tabId;
  clearConversation();
  if (threadScope) threadScope.textContent = "이 탭의 문맥";
};
const updatePageLabel = (page: unknown): void => {
  if (
    !threadScope ||
    typeof page !== "object" ||
    page === null ||
    typeof (page as { title?: unknown }).title !== "string"
  )
    return;
  const title = (page as { title: string }).title;
  const origin =
    typeof (page as { origin?: unknown }).origin === "string"
      ? (page as { origin: string }).origin
      : undefined;
  threadScope.textContent = origin ? `${title} · ${origin}` : title;
  threadScope.setAttribute(
    "aria-label",
    origin ? `현재 페이지: ${title}, ${origin}` : `현재 페이지: ${title}`,
  );
  threadScope.title = origin ? `${title} · ${origin}` : title;
};
const recoverChatEvents = async (attempt = 0): Promise<void> => {
  const recoveryId = ++latestRecoveryId;
  try {
    const response = await runtime?.sendMessage({ kind: "CHAT_RECOVER" });
    if (
      recoveryId === latestRecoveryId &&
      typeof response === "object" &&
      response !== null &&
      (response as { ok?: unknown }).ok &&
      Array.isArray((response as { events?: unknown }).events)
    ) {
      const tabId = (response as { tab_id?: unknown }).tab_id;
      if (!Number.isInteger(tabId)) throw new Error("missing recovered tab");
      selectThread(tabId as number);
      const scope = (response as { scope?: unknown }).scope;
      if (
        threadScope &&
        typeof scope === "object" &&
        scope !== null &&
        typeof (scope as { origin?: unknown }).origin === "string" &&
        typeof (scope as { path?: unknown }).path === "string"
      )
        threadScope.textContent = `${(scope as { origin: string }).origin}${(scope as { path: string }).path} · 이 탭의 문맥`;
      updatePageLabel((response as { page?: unknown }).page);
      for (const event of (response as { events: unknown[] }).events)
        applyChatEvent(event);
      return;
    }
  } catch {
    // A suspended worker can still be restoring trusted session storage.
  }
  if (attempt < 20 && recoveryId === latestRecoveryId)
    window.setTimeout(() => void recoverChatEvents(attempt + 1), 100);
};
settingsOpen?.addEventListener("click", openSettings);
newChatOpen?.addEventListener("click", () => {
  if (newChatDialog?.open) return;
  newChatDialog?.showModal();
});
newChatCancel?.addEventListener("click", () => newChatDialog?.close());
newChatConfirm?.addEventListener("click", () => {
  if (!newChatConfirm) return;
  newChatConfirm.disabled = true;
  void sendRuntime({ kind: "CHAT_CLEAR" })
    .then(() => {
      clearConversation(true);
      newChatDialog?.close();
      setStatus("새 대화를 시작했습니다.");
    })
    .catch((error: unknown) =>
      showFailure(error instanceof Error ? error.message : undefined),
    )
    .finally(() => {
      newChatConfirm.disabled = false;
    });
});
modeAsk?.addEventListener("click", () => {
  chatMode = "ask";
  modeAsk.setAttribute("aria-pressed", "true");
  modeAct?.setAttribute("aria-pressed", "false");
  setStatus("질문 모드입니다.");
});
modeAct?.addEventListener("click", () => {
  chatMode = "act";
  modeAsk?.setAttribute("aria-pressed", "false");
  modeAct.setAttribute("aria-pressed", "true");
  setStatus("실행 모드입니다.");
});
const receiveChatEvent = (message: unknown): void => {
  if (
    typeof message === "object" &&
    message !== null &&
    (message as { kind?: unknown }).kind === "CHAT_THREAD_CHANGED"
  ) {
    const tabId = (message as { tab_id?: unknown }).tab_id;
    if (Number.isInteger(tabId)) selectThread(tabId as number);
    void recoverChatEvents();
    return;
  }
  if (
    typeof message === "object" &&
    message !== null &&
    (message as { kind?: unknown }).kind === "CHAT_EVENT"
  )
    applyChatEvent((message as { event?: unknown }).event);
};
panelPort?.onMessage.addListener(receiveChatEvent);
runtime?.onMessage.addListener(receiveChatEvent);
chromeApi?.tabs?.onActivated?.addListener(() => void recoverChatEvents());
attachmentTrigger?.addEventListener("click", () => attachmentInput?.click());
suggestedPrompt?.addEventListener("click", () => {
  if (!chatInput) return;
  chatInput.value = "이 페이지를 요약해 주세요.";
  chatInput.focus();
});
attachmentInput?.addEventListener("change", () => {
  const file = attachmentInput.files?.[0];
  if (!file) return;
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  if (!extension || !textAttachmentExtensions.has(extension)) {
    clearAttachment();
    setStatus("txt, md, csv, json 파일만 첨부할 수 있습니다.");
    return;
  }
  if (file.size > maxAttachmentBytes) {
    clearAttachment();
    setStatus("128KB 이하의 텍스트 파일만 첨부할 수 있습니다.");
    return;
  }
  void file
    .text()
    .then((text) => {
      attachment = {
        name: file.name.slice(0, 255),
        text: text.slice(0, maxAttachmentChars),
        truncated: text.length > maxAttachmentChars,
      };
      renderAttachment();
      setStatus(
        attachment.truncated
          ? "파일 앞부분 6,000자만 첨부합니다."
          : "파일을 첨부했습니다.",
      );
    })
    .catch(() => {
      clearAttachment();
      setStatus("파일을 읽지 못했습니다.");
    });
});
chatForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (runActive) return;
  const question = chatInput?.value.trim() ?? "";
  const prompt = attachmentPrompt(question);
  if (!prompt) {
    setStatus(
      attachment
        ? "질문과 첨부 파일은 합쳐서 8,000자 이하여야 합니다."
        : "질문 또는 텍스트 파일을 입력해 주세요.",
    );
    return;
  }
  skipNextLiveUserMessage = true;
  append(
    message(
      "user",
      redactForChat(
        question ||
          (attachment ? `${attachment.name} 파일을 분석해 주세요.` : ""),
      ),
    ),
  );
  if (chatInput) chatInput.value = "";
  setRunActive(true);
  setStatus("응답을 기다리는 중입니다.");
  void sendRuntime({ kind: "CHAT_SEND", payload: { prompt, mode: chatMode } })
    .then(() => {
      clearAttachment();
      // A response can return before (or after a transient loss of) the panel
      // port. This especially matters for Act: its successful response has no
      // display text, only a live action-review event. Reconcile the
      // sequence-addressable timeline after every completed request; already
      // rendered events are ignored by their thread sequence.
      void recoverChatEvents();
    })
    .catch((error: unknown) => {
      setRunActive(false);
      showFailure(error instanceof Error ? error.message : undefined);
    });
});
const cancelRun = (): void => {
  if (!runActive) return;
  setRunActive(false);
  void sendRuntime({ kind: "CANCEL" })
    .then(() => setStatus("작업을 중단했습니다."))
    .catch((error: unknown) =>
      showFailure(error instanceof Error ? error.message : undefined),
    );
};
send?.addEventListener("click", (event) => {
  if (!runActive) return;
  event.preventDefault();
  cancelRun();
});
chatInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (!runActive) chatForm?.requestSubmit();
});
void recoverChatEvents();
window.addEventListener("focus", () => void recoverChatEvents());
void runtime
  ?.sendMessage({ kind: "AGENT_PREFERENCES_GET" })
  .then((response) => {
    const preferences =
      typeof response === "object" && response !== null
        ? (response as { preferences?: { permission_mode?: unknown } })
            .preferences
        : undefined;
    if (typeof preferences?.permission_mode === "string")
      applyPermissionMode(preferences.permission_mode);
  });
