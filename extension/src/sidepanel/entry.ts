type BrowserRuntime = {
  sendMessage(message: unknown): Promise<unknown>;
  onMessage: {
    addListener(listener: (message: unknown) => void): void;
  };
};
const runtime = (
  globalThis as typeof globalThis & { chrome?: { runtime: BrowserRuntime } }
).chrome?.runtime;
const preview = document.querySelector<HTMLButtonElement>("#preview");
const profileResolve =
  document.querySelector<HTMLButtonElement>("#profile-resolve");
const cancel = document.querySelector<HTMLButtonElement>("#cancel");
const status = document.querySelector<HTMLOutputElement>("#status");
const projection = document.querySelector<HTMLElement>("#projection");
const chatForm = document.querySelector<HTMLFormElement>("#chat-form");
const chatInput = document.querySelector<HTMLTextAreaElement>("#chat-input");
const chatMessages = document.querySelector<HTMLElement>("#chat-messages");
const modeAsk = document.querySelector<HTMLButtonElement>("#mode-ask");
const modeAct = document.querySelector<HTMLButtonElement>("#mode-act");
const actionReviewCard = document.querySelector<HTMLElement>(
  "#action-review-card",
);
const actionReviewDescription = document.querySelector<HTMLElement>(
  "#action-review-description",
);
const actionApprove =
  document.querySelector<HTMLButtonElement>("#action-approve");
const actionReject =
  document.querySelector<HTMLButtonElement>("#action-reject");
const actionValueForm =
  document.querySelector<HTMLFormElement>("#action-value-form");
const actionValue = document.querySelector<HTMLInputElement>("#action-value");
const planApprove = document.querySelector<HTMLButtonElement>("#plan-approve");
const permissionCard = document.querySelector<HTMLElement>("#permission-card");
const permissionDescription = document.querySelector<HTMLElement>(
  "#permission-description",
);
const permissionOnce =
  document.querySelector<HTMLButtonElement>("#permission-once");
const permissionAlways =
  document.querySelector<HTMLButtonElement>("#permission-always");
const permissionDeny =
  document.querySelector<HTMLButtonElement>("#permission-deny");
const permissionModeBadge = document.querySelector<HTMLElement>(
  "#permission-mode-badge",
);
const runBanner = document.querySelector<HTMLElement>("#run-banner");
let chatMode: "ask" | "act" = "ask";
let pendingAction:
  | { sessionId: string; proposalId: string; origin?: string }
  | undefined;
let pendingPermissionId: string | undefined;
let pendingValue:
  | { sessionId: string; proposalId: string; valueKind: "text" | "option" }
  | undefined;
const eventSequences = new Map<string, number>();
const streamingMessages = new Map<string, HTMLParagraphElement>();
const pendingDeltas = new Map<string, string>();
let deltaFrame: number | undefined;
let eventDeliveredForPendingResponse = false;
let currentPermissionMode = "standard";
const maxTranscriptItems = 1_000;
const nearTranscriptBottom = (): boolean => {
  if (!chatMessages) return false;
  return (
    chatMessages.scrollHeight -
      chatMessages.scrollTop -
      chatMessages.clientHeight <
    32
  );
};
const retainTranscriptBudget = (): void => {
  if (!chatMessages) return;
  while (chatMessages.children.length > maxTranscriptItems)
    chatMessages.firstElementChild?.remove();
};
const keepTranscriptAnchor = (wasAtBottom: boolean): void => {
  if (wasAtBottom && chatMessages)
    chatMessages.scrollTop = chatMessages.scrollHeight;
};
const setChatMode = (mode: "ask" | "act"): void => {
  chatMode = mode;
  for (const [button, active] of [
    [modeAsk, mode === "ask"],
    [modeAct, mode === "act"],
  ] as const) {
    button?.setAttribute("aria-pressed", String(active));
  }
  if (status)
    status.value = mode === "ask" ? "질문 모드입니다." : "실행 모드입니다.";
};
modeAsk?.addEventListener("click", () => setChatMode("ask"));
modeAct?.addEventListener("click", () => setChatMode("act"));
const appendMessage = (role: "user" | "assistant", text: string): void => {
  if (!chatMessages) return;
  const wasAtBottom = nearTranscriptBottom();
  const item = document.createElement("p");
  item.dataset.role = role;
  item.textContent = `${role === "user" ? "나" : "Agent"}: ${text}`;
  chatMessages.append(item);
  retainTranscriptBudget();
  keepTranscriptAnchor(wasAtBottom);
};
const appendToolMessage = (
  tool: string,
  text: string,
): HTMLParagraphElement | undefined => {
  if (!chatMessages) return undefined;
  const wasAtBottom = nearTranscriptBottom();
  const previous = chatMessages.lastElementChild;
  if (
    previous instanceof HTMLParagraphElement &&
    previous.dataset.tool === "read" &&
    previous.dataset.toolName === tool
  ) {
    const count = Number(previous.dataset.count ?? "1") + 1;
    previous.dataset.count = String(count);
    previous.textContent = `도구: ${text} (${count}회)`;
    keepTranscriptAnchor(wasAtBottom);
    return previous;
  }
  const item = document.createElement("p");
  item.dataset.role = "assistant";
  item.dataset.tool = [
    "read_page",
    "get_page_text",
    "find",
    "read_batch",
  ].includes(tool)
    ? "read"
    : "action";
  item.dataset.toolName = tool;
  item.dataset.count = "1";
  item.textContent = `도구: ${text}`;
  chatMessages.append(item);
  retainTranscriptBudget();
  keepTranscriptAnchor(wasAtBottom);
  return item;
};
const flushDeltas = (): void => {
  deltaFrame = undefined;
  for (const [runId, text] of pendingDeltas) {
    const item = streamingMessages.get(runId);
    if (item) item.textContent += text;
    else {
      appendMessage("assistant", text);
      const created = chatMessages?.lastElementChild;
      if (created instanceof HTMLParagraphElement)
        streamingMessages.set(runId, created);
    }
  }
  pendingDeltas.clear();
};
const queueAssistantDelta = (runId: string, text: string): void => {
  pendingDeltas.set(runId, `${pendingDeltas.get(runId) ?? ""}${text}`);
  if (deltaFrame !== undefined) return;
  deltaFrame = requestAnimationFrame(flushDeltas);
};
const setRunActive = (active: boolean): void => {
  cancel?.toggleAttribute("disabled", !active);
  chatMessages?.setAttribute("aria-busy", String(active));
};
const applyChatEvent = (event: unknown): void => {
  if (
    typeof event !== "object" ||
    event === null ||
    typeof (event as { run_id?: unknown }).run_id !== "string" ||
    !Number.isInteger((event as { sequence?: unknown }).sequence) ||
    typeof (event as { type?: unknown }).type !== "string"
  )
    return;
  const value = event as Record<string, unknown>;
  const runId = value.run_id as string;
  const sequence = value.sequence as number;
  const previous = eventSequences.get(runId) ?? 0;
  if (sequence <= previous) return;
  if (sequence > previous + 1) {
    void runtime
      ?.sendMessage({ kind: "CHAT_RESYNC", run_id: runId, sequence: previous })
      .then((response) => {
        if (
          typeof response === "object" &&
          response !== null &&
          (response as { ok?: unknown }).ok &&
          Array.isArray((response as { events?: unknown }).events)
        )
          for (const missing of (response as { events: unknown[] }).events)
            applyChatEvent(missing);
      });
    return;
  }
  eventSequences.set(runId, sequence);
  if (value.type === "run_started") {
    eventDeliveredForPendingResponse = true;
    const permissionMode =
      typeof value.permission_mode === "string"
        ? value.permission_mode
        : "standard";
    if (permissionModeBadge) {
      currentPermissionMode = permissionMode;
      permissionModeBadge.dataset.mode = permissionMode;
      permissionModeBadge.textContent =
        permissionMode === "skip_all_permission_checks"
          ? "권한 질문 생략"
          : permissionMode === "follow_a_plan"
            ? "계획 제한"
            : "표준 권한";
    }
    if (runBanner) {
      runBanner.textContent =
        permissionMode === "skip_all_permission_checks"
          ? "권한 질문이 생략됩니다. credential, 위험 확인, restricted page 차단은 계속 적용됩니다."
          : "현재 페이지 정보를 안전하게 읽는 중입니다.";
      runBanner.hidden = false;
    }
    if (status) status.value = "응답을 생성하는 중입니다.";
    setRunActive(true);
    return;
  }
  if (value.type === "assistant_delta" && typeof value.text === "string") {
    eventDeliveredForPendingResponse = true;
    queueAssistantDelta(runId, value.text);
    return;
  }
  if (
    value.type === "tool_started" &&
    typeof value.summary === "string" &&
    typeof value.tool === "string"
  ) {
    eventDeliveredForPendingResponse = true;
    flushDeltas();
    appendToolMessage(value.tool, value.summary);
    return;
  }
  if (value.type === "tool_finished") return;
  if (value.type === "run_terminal") {
    flushDeltas();
    streamingMessages.delete(runId);
    pendingDeltas.delete(runId);
    setRunActive(false);
    if (runBanner) runBanner.hidden = true;
    if (status)
      status.value =
        value.outcome === "VERIFIED"
          ? "응답을 받았습니다."
          : "작업이 종료되었습니다.";
  }
};
runtime?.onMessage.addListener((message) => {
  if (
    typeof message === "object" &&
    message !== null &&
    (message as { kind?: unknown }).kind === "CHAT_EVENT"
  )
    applyChatEvent((message as { event?: unknown }).event);
});
const recoverChatEvents = async (attempt = 0): Promise<void> => {
  try {
    const response = await runtime?.sendMessage({ kind: "CHAT_RECOVER" });
    if (
      typeof response === "object" &&
      response !== null &&
      (response as { ok?: unknown }).ok &&
      Array.isArray((response as { streams?: unknown }).streams)
    ) {
      for (const stream of (response as { streams: unknown[] }).streams) {
        if (
          typeof stream !== "object" ||
          stream === null ||
          !Array.isArray((stream as { events?: unknown }).events)
        )
          continue;
        for (const event of (stream as { events: unknown[] }).events)
          applyChatEvent(event);
      }
      return;
    }
  } catch {
    // A suspended worker may be recreating its trusted storage boundary.
  }
  if (attempt < 20)
    window.setTimeout(() => {
      void recoverChatEvents(attempt + 1);
    }, 100);
};
void recoverChatEvents();
window.addEventListener("focus", () => {
  void recoverChatEvents();
});
void runtime
  ?.sendMessage({ kind: "AGENT_PREFERENCES_GET" })
  .then((response) => {
    if (
      typeof response !== "object" ||
      response === null ||
      !(response as { ok?: unknown }).ok ||
      typeof (response as { preferences?: unknown }).preferences !== "object" ||
      (response as { preferences?: unknown }).preferences === null
    )
      return;
    const mode = (response as { preferences: { permission_mode?: unknown } })
      .preferences.permission_mode;
    if (typeof mode !== "string" || !permissionModeBadge) return;
    currentPermissionMode = mode;
    permissionModeBadge.dataset.mode = mode;
    permissionModeBadge.textContent =
      mode === "skip_all_permission_checks"
        ? "권한 질문 생략"
        : mode === "follow_a_plan"
          ? "계획 제한"
          : "표준 권한";
  });
const hideActionReview = (): void => {
  pendingAction = undefined;
  pendingValue = undefined;
  actionValueForm?.setAttribute("hidden", "");
  if (actionValue) actionValue.value = "";
  actionReviewCard?.setAttribute("hidden", "");
  planApprove?.setAttribute("hidden", "");
};
const showActionReview = (response: {
  session_id: string;
  proposal_id: string;
  tool: string;
  target_name: string;
  suggested_value?: string;
  origin?: string;
}): void => {
  pendingAction = {
    sessionId: response.session_id,
    proposalId: response.proposal_id,
    ...(response.origin ? { origin: response.origin } : {}),
  };
  if (actionReviewDescription) {
    const action =
      response.tool === "click_by_ref"
        ? "클릭"
        : response.tool === "set_text_by_ref"
          ? "입력"
          : response.tool === "set_checked_by_ref"
            ? "변경"
            : response.tool === "press_key_by_ref"
              ? "키 입력"
              : "선택";
    actionReviewDescription.textContent = response.suggested_value
      ? `${response.target_name}에서 “${response.suggested_value}”을 ${action}하도록 제안했습니다.`
      : `${response.target_name}을 ${action}하도록 제안했습니다.`;
  }
  actionReviewCard?.removeAttribute("hidden");
  if (currentPermissionMode === "follow_a_plan" && response.origin)
    planApprove?.removeAttribute("hidden");
  if (status) status.value = "제안을 검토한 뒤 실행해 주세요.";
};
const handleActionResponse = (response: unknown): boolean => {
  if (
    typeof response !== "object" ||
    response === null ||
    !(response as { ok?: unknown }).ok
  )
    return false;
  const value = response as Record<string, unknown>;
  if (
    value.state === "ACTION_REVIEW" &&
    typeof value.session_id === "string" &&
    typeof value.proposal_id === "string" &&
    typeof value.tool === "string" &&
    typeof value.target_name === "string"
  ) {
    showActionReview({
      session_id: value.session_id,
      proposal_id: value.proposal_id,
      tool: value.tool,
      target_name: value.target_name,
      ...(typeof value.suggested_value === "string"
        ? { suggested_value: value.suggested_value }
        : {}),
      ...(typeof value.origin === "string" ? { origin: value.origin } : {}),
    });
    return true;
  }
  if (
    value.state === "VALUE_REQUIRED" &&
    typeof value.session_id === "string" &&
    typeof value.proposal_id === "string" &&
    (value.value_kind === "text" || value.value_kind === "option") &&
    typeof value.target_name === "string"
  ) {
    pendingValue = {
      sessionId: value.session_id,
      proposalId: value.proposal_id,
      valueKind: value.value_kind,
    };
    actionReviewCard?.removeAttribute("hidden");
    actionValueForm?.removeAttribute("hidden");
    if (actionValue) {
      actionValue.value = "";
      actionValue.placeholder = `${value.target_name}에 입력할 값을 작성하세요.`;
      actionValue.focus();
    }
    if (status) status.value = "입력값을 확인한 뒤 적용해 주세요.";
    return true;
  }
  if (
    value.state === "PERMISSION_REQUIRED" &&
    typeof value.permission_request_id === "string"
  ) {
    pendingPermissionId = value.permission_request_id;
    if (permissionDescription)
      permissionDescription.textContent = `현재 페이지에서 ${value.capability === "click" ? "클릭" : "선택"} 실행을 허용할까요?`;
    permissionCard?.removeAttribute("hidden");
    if (status) status.value = "실행 권한이 필요합니다.";
    return true;
  }
  if (value.state === "ANSWER" && typeof value.message === "string") {
    hideActionReview();
    appendMessage("assistant", value.message);
    if (status) status.value = "분석 작업을 완료했습니다.";
    return true;
  }
  return false;
};
const approveAction = async (): Promise<void> => {
  if (!runtime || !pendingAction || !status) return;
  const response = await runtime.sendMessage({
    kind: "ACT_APPROVE",
    session_id: pendingAction.sessionId,
    proposal_id: pendingAction.proposalId,
  });
  if (handleActionResponse(response)) return;
  const code =
    typeof response === "object" &&
    response !== null &&
    typeof (response as { code?: unknown }).code === "string"
      ? (response as { code: string }).code
      : "UNKNOWN";
  status.value = `실행을 완료하지 못했습니다. (${code})`;
};

chatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!runtime || !chatInput || !status) return;
  const prompt = chatInput.value.trim();
  if (!prompt) return;
  appendMessage("user", prompt);
  chatInput.value = "";
  status.value = "응답을 기다리는 중입니다.";
  setRunActive(true);
  eventDeliveredForPendingResponse = false;
  let response: unknown;
  try {
    response = await runtime.sendMessage({
      kind: "CHAT_SEND",
      payload: { prompt, mode: chatMode },
    });
  } catch (error) {
    console.error("[ContextPilot][Side Panel CHAT_SEND failed]", error);
    status.value = "확장 프로그램 Service Worker 연결에 실패했습니다.";
    setRunActive(false);
    return;
  }
  if (handleActionResponse(response)) return;
  if (
    typeof response === "object" &&
    response !== null &&
    (response as { ok?: unknown }).ok &&
    typeof (response as { message?: unknown }).message === "string"
  ) {
    if (!eventDeliveredForPendingResponse)
      appendMessage("assistant", (response as { message: string }).message);
    status.value = "응답을 받았습니다.";
  } else {
    const code =
      typeof response === "object" &&
      response !== null &&
      typeof (response as { code?: unknown }).code === "string"
        ? (response as { code: string }).code
        : "UNKNOWN";
    console.warn("[ContextPilot][Side Panel CHAT_SEND rejected]", response);
    status.value = `질문을 처리하지 못했습니다. (${code})`;
    setRunActive(false);
  }
});

actionApprove?.addEventListener("click", () => {
  void approveAction();
});
actionReject?.addEventListener("click", async () => {
  if (!runtime || !pendingAction || !status) return;
  const response = await runtime.sendMessage({
    kind: "ACT_REJECT",
    session_id: pendingAction.sessionId,
    proposal_id: pendingAction.proposalId,
  });
  hideActionReview();
  status.value =
    typeof response === "object" &&
    response !== null &&
    (response as { ok?: unknown }).ok
      ? "작업을 중단했습니다."
      : "작업을 중단하지 못했습니다.";
});
actionValueForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!runtime || !pendingValue || !actionValue || !status) return;
  const value = actionValue.value;
  if (!value) {
    status.value = "입력값을 작성해 주세요.";
    return;
  }
  const response = await runtime.sendMessage({
    kind: "ACT_VALUE_SUBMIT",
    session_id: pendingValue.sessionId,
    proposal_id: pendingValue.proposalId,
    value,
  });
  if (handleActionResponse(response)) return;
  const code =
    typeof response === "object" &&
    response !== null &&
    typeof (response as { code?: unknown }).code === "string"
      ? (response as { code: string }).code
      : "UNKNOWN";
  status.value = `입력값을 적용하지 못했습니다. (${code})`;
});
planApprove?.addEventListener("click", async () => {
  if (!runtime || !pendingAction?.origin || !status) return;
  const response = await runtime.sendMessage({
    kind: "PLAN_APPROVE",
    run_id: pendingAction.sessionId,
    origins: [pendingAction.origin],
  });
  if (
    typeof response === "object" &&
    response !== null &&
    (response as { ok?: unknown }).ok
  ) {
    planApprove.setAttribute("hidden", "");
    status.value = "현재 도메인을 이번 작업 계획에 승인했습니다.";
  } else status.value = "도메인 계획 승인을 저장하지 못했습니다.";
});
const decidePermission = async (
  decision: "once" | "always" | "deny",
): Promise<void> => {
  if (!runtime || !pendingPermissionId || !status) return;
  const requestId = pendingPermissionId;
  pendingPermissionId = undefined;
  permissionCard?.setAttribute("hidden", "");
  const response = await runtime.sendMessage({
    kind: "PERMISSION_DECISION",
    permission_request_id: requestId,
    decision,
  });
  if (
    !(
      typeof response === "object" &&
      response !== null &&
      (response as { ok?: unknown }).ok
    )
  ) {
    status.value = "권한 결정을 저장하지 못했습니다.";
    return;
  }
  if (decision === "deny") {
    hideActionReview();
    status.value = "작업 권한을 거부했습니다.";
    return;
  }
  await approveAction();
};
permissionOnce?.addEventListener("click", () => {
  void decidePermission("once");
});
permissionAlways?.addEventListener("click", () => {
  void decidePermission("always");
});
permissionDeny?.addEventListener("click", () => {
  void decidePermission("deny");
});

preview?.addEventListener("click", async () => {
  if (!runtime || !status || !projection) return;
  status.value = "페이지 projection을 확인하는 중입니다.";
  const result = await runtime.sendMessage({ kind: "START_PREVIEW" });
  if (
    typeof result !== "object" ||
    result === null ||
    !(result as { ok?: unknown }).ok
  ) {
    const code =
      typeof result === "object" &&
      result !== null &&
      typeof (result as { code?: unknown }).code === "string"
        ? (result as { code: string }).code
        : "UNKNOWN";
    status.value = `현재 페이지의 projection을 읽지 못했습니다. (${code})`;
    projection.textContent = "";
    return;
  }
  status.value = "projection을 확인했습니다.";
  projection.textContent = JSON.stringify(
    (result as { snapshot: unknown }).snapshot,
    null,
    2,
  );
});
profileResolve?.addEventListener("click", async () => {
  if (!runtime || !status) return;
  status.value = "Page Profile을 확인하는 중입니다.";
  const response = await runtime.sendMessage({ kind: "RESOLVE_PROFILE" });
  if (
    typeof response === "object" &&
    response !== null &&
    (response as { ok?: unknown }).ok
  ) {
    const value = response as {
      resolution: string;
      profile_id?: string;
      profile_version?: number;
      business_mcp_count: number;
    };
    status.value = `Profile ${value.resolution}: ${value.profile_id ?? "unknown"} v${value.profile_version ?? "-"}, MCP ${value.business_mcp_count}개`;
  } else {
    status.value = "Resolver 설정 또는 Page Profile을 확인할 수 없습니다.";
  }
});

cancel?.addEventListener("click", async () => {
  if (!runtime || !status) return;
  setRunActive(false);
  const result = await runtime.sendMessage({ kind: "CANCEL" });
  status.value =
    typeof result === "object" &&
    result !== null &&
    (result as { ok?: unknown }).ok
      ? "작업을 중단했습니다."
      : "중단 요청을 완료할 수 없습니다.";
});
