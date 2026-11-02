import { downloadPanelDiagnostics } from "./panel-diagnostics.js";
import type { PanelClient } from "@contextpilot/shared/bridge";
import { mountPanelAttachments } from "./panel-attachments.js";
export interface PanelControlState {
  client(): PanelClient | undefined;
  connected(): boolean;
  busy(): boolean;
  request(): { requestId: string; runId?: string } | undefined;
  pending(requestId: string): void;
  stopping(): void;
  clear(): void;
  status(text: string): void;
}
export function mountPanelControls(
  document: Document,
  state: PanelControlState,
) {
  const subscriptions: (() => void)[] = [];
  const listen = (id: string, type: string, fn: (event: Event) => void) => {
    const node = document.getElementById(id);
    node?.addEventListener(type, fn);
    subscriptions.push(() => node?.removeEventListener(type, fn));
  };
  const input = document.getElementById("chat-input") as HTMLTextAreaElement;
  const dialog = document.getElementById(
    "new-chat-dialog",
  ) as HTMLDialogElement;
  const attachments = mountPanelAttachments(document, state.status);
  let mode: "ask" | "act" = "ask",
    live = true;
  const history: string[] = [];
  let position = 0,
    draft = "";
  const report = (work: Promise<void>) => {
    void work.catch(() => {
      if (live)
        state.status(
          "요청 전달 결과를 확인하지 못했습니다. 최신 상태를 기다려 주세요.",
        );
    });
  };
  listen("chat-form", "submit", (event) => {
    event.preventDefault();
    if (state.busy()) return;
    const client = state.client();
    if (!client || !state.connected()) {
      state.status("Backend task admission is not available yet");
      return;
    }
    const text = attachments.prompt(input.value.trim());
    if (!text) {
      state.status("질문과 첨부 파일은 합쳐서 8,000자 이하여야 합니다.");
      return;
    }
    history.push(input.value);
    if (history.length > 50) history.shift();
    position = history.length;
    const requestId = crypto.randomUUID();
    state.pending(requestId);
    report(
      client.start({ requestId, text, mode }).then(() => {
        if (live) {
          input.value = "";
          attachments.clear();
        }
      }),
    );
  });
  listen("chat-send", "click", (event) => {
    if (!state.busy()) return;
    event.preventDefault();
    const request = state.request(),
      client = state.client();
    if (!request || !client || !state.connected()) {
      state.status("중단 요청을 전달할 연결을 확인해 주세요.");
      return;
    }
    state.stopping();
    report(client.cancel(request));
  });
  for (const selected of ["ask", "act"] as const)
    listen(`mode-${selected}`, "click", () => {
      mode = selected;
      for (const other of ["ask", "act"])
        document
          .getElementById(`mode-${other}`)
          ?.setAttribute("aria-pressed", String(other === mode));
      state.status(mode === "ask" ? "질문 모드입니다." : "실행 모드입니다.");
    });
  listen("suggested-prompt", "click", () => {
    input.value = "이 페이지를 요약해 주세요.";
    input.focus();
  });
  listen("chat-input", "keydown", (event) => {
    const key = event as KeyboardEvent;
    if (key.key === "ArrowUp" && history.length) {
      key.preventDefault();
      if (position === history.length) draft = input.value;
      position = Math.max(0, position - 1);
      input.value = history[position]!;
    } else if (key.key === "ArrowDown" && position < history.length) {
      key.preventDefault();
      position++;
      input.value = position === history.length ? draft : history[position]!;
    } else if (key.key === "Enter" && !key.shiftKey && !key.isComposing) {
      key.preventDefault();
      if (!state.busy())
        (
          document.getElementById("chat-form") as HTMLFormElement
        ).requestSubmit();
    }
  });
  listen("new-chat-open", "click", () => {
    if (!dialog.open) dialog.showModal();
  });
  listen("new-chat-cancel", "click", () => dialog.close());
  listen("new-chat-confirm", "click", () => {
    const client = state.client();
    if (!client || !state.connected()) {
      state.status("Backend 연결을 확인해 주세요.");
      return;
    }
    const control = document.getElementById(
      "new-chat-confirm",
    ) as HTMLButtonElement;
    control.disabled = true;
    report(
      client
        .clear()
        .then(() => {
          if (live) {
            state.clear();
            attachments.clear();
            history.length = 0;
            position = 0;
            input.value = "";
            dialog.close();
            input.focus();
          }
        })
        .finally(() => {
          control.disabled = false;
        }),
    );
  });
  listen("settings-open", "click", () => {
    const runtime = (
      globalThis as typeof globalThis & {
        chrome?: { runtime: { openOptionsPage(): Promise<void> } };
      }
    ).chrome?.runtime;
    if (runtime) report(runtime.openOptionsPage());
  });
  const diagnostics = document.getElementById(
    "diagnostics-dialog",
  ) as HTMLDialogElement;
  listen("diagnostics-dialog-close", "click", () => diagnostics.close());
  listen("diagnostics-debug", "click", () =>
    state.status(
      "Backend 추적은 아직 연결되지 않았습니다. 현재 화면 상태만 확인할 수 있습니다.",
    ),
  );
  listen("diagnostics-export", "click", () =>
    downloadPanelDiagnostics(document),
  );
  listen("workflow-record", "click", () =>
    state.status("이 기록 기능은 아직 Backend에 연결되지 않았습니다."),
  );
  return () => {
    live = false;
    attachments.dispose();
    subscriptions.forEach((remove) => remove());
  };
}
