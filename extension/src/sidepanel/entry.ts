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
const appendMessage = (role: "user" | "assistant", text: string): void => {
  if (!chatMessages) return;
  const item = document.createElement("p");
  item.dataset.role = role;
  item.textContent = `${role === "user" ? "나" : "Agent"}: ${text}`;
  chatMessages.append(item);
};

chatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!runtime || !chatInput || !status) return;
  const prompt = chatInput.value.trim();
  if (!prompt) return;
  appendMessage("user", prompt);
  chatInput.value = "";
  status.value = "응답을 기다리는 중입니다.";
  const response = await runtime.sendMessage({
    kind: "CHAT_SEND",
    payload: { prompt },
  });
  if (
    typeof response === "object" &&
    response !== null &&
    (response as { ok?: unknown }).ok &&
    typeof (response as { message?: unknown }).message === "string"
  ) {
    appendMessage("assistant", (response as { message: string }).message);
    status.value = "응답을 받았습니다.";
  } else {
    status.value = "Provider를 설정하거나 연결 상태를 확인해 주세요.";
  }
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
    status.value = "현재 페이지의 projection을 읽지 못했습니다.";
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
