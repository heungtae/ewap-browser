type BrowserRuntime = { sendMessage(message: unknown): Promise<unknown> };
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
let chatMode: "ask" | "act" = "ask";
let pendingAction: { sessionId: string; proposalId: string } | undefined;
let pendingPermissionId: string | undefined;
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
  const item = document.createElement("p");
  item.dataset.role = role;
  item.textContent = `${role === "user" ? "나" : "Agent"}: ${text}`;
  chatMessages.append(item);
};
const hideActionReview = (): void => {
  pendingAction = undefined;
  actionReviewCard?.setAttribute("hidden", "");
};
const showActionReview = (response: {
  session_id: string;
  proposal_id: string;
  tool: string;
  target_name: string;
  suggested_value?: string;
}): void => {
  pendingAction = {
    sessionId: response.session_id,
    proposalId: response.proposal_id,
  };
  if (actionReviewDescription) {
    const action = response.tool === "click_by_ref" ? "클릭" : "선택";
    actionReviewDescription.textContent = response.suggested_value
      ? `${response.target_name}에서 “${response.suggested_value}”을 ${action}하도록 제안했습니다.`
      : `${response.target_name}을 ${action}하도록 제안했습니다.`;
  }
  actionReviewCard?.removeAttribute("hidden");
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
    });
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
  let response: unknown;
  try {
    response = await runtime.sendMessage({
      kind: "CHAT_SEND",
      payload: { prompt, mode: chatMode },
    });
  } catch (error) {
    console.error("[ContextPilot][Side Panel CHAT_SEND failed]", error);
    status.value = "확장 프로그램 Service Worker 연결에 실패했습니다.";
    return;
  }
  if (handleActionResponse(response)) return;
  if (
    typeof response === "object" &&
    response !== null &&
    (response as { ok?: unknown }).ok &&
    typeof (response as { message?: unknown }).message === "string"
  ) {
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
  const result = await runtime.sendMessage({ kind: "CANCEL" });
  status.value =
    typeof result === "object" &&
    result !== null &&
    (result as { ok?: unknown }).ok
      ? "작업을 중단했습니다."
      : "중단 요청을 완료할 수 없습니다.";
});
