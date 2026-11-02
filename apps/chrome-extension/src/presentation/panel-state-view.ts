import {
  openPanelDiagnostics,
  downloadPanelDiagnostics,
} from "./panel-diagnostics.js";
import type { PanelEvent } from "@contextpilot/shared/bridge";
import { actCompletionView } from "../../../../extension/src/sidepanel/act-completion-view.js";
import {
  userMessage,
  failureHelp,
} from "../../../../extension/src/sidepanel/panel.js";
import { card, actionRow, button, type PanelCards } from "./panel-dom.js";
export function runStartView(
  ctx: PanelCards,
  event: Extract<PanelEvent, { type: "run_started" }>,
) {
  const badge = ctx.document.getElementById("permission-mode-badge");
  if (badge) {
    badge.dataset.mode = event.permission_mode;
    badge.textContent =
      (
        {
          full: "Full Permission",
          custom: "항목별 승인 설정",
          skip_all_permission_checks: "권한 질문 생략",
          follow_a_plan: "계획 제한",
        } as Record<string, string>
      )[event.permission_mode] ?? "표준 권한";
  }
  ctx.status("응답을 생성하는 중입니다.");
  return event.mode === "act"
    ? "페이지 작업을 안전하게 준비하는 중입니다."
    : "현재 페이지 정보를 안전하게 읽는 중입니다.";
}
export function terminalView(
  ctx: PanelCards,
  event: Extract<PanelEvent, { type: "run_terminal" }>,
) {
  const completion = actCompletionView(event.completion);
  if (completion && event.outcome !== "CANCELLED") {
    ctx.status(completion.message);
    return { active: completion.active, text: completion.message };
  }
  if (event.outcome === "VERIFIED") ctx.status("작업을 완료했습니다.");
  else if (event.outcome === "CANCELLED") ctx.status("작업을 중단했습니다.");
  else {
    const text =
      event.code && event.code in userMessage
        ? userMessage[event.code as keyof typeof userMessage]
        : "작업 결과를 확인하지 못했습니다.";
    const title =
      event.code === "GOAL_INCOMPLETE"
        ? "목표에 남은 작업이 있습니다"
        : event.code === "UNSUPPORTED_COMPLETION"
          ? "작업을 실행하지 않았습니다"
          : event.code === "POSTCONDITION_UNVERIFIED"
            ? "작업은 실행됐지만 결과를 확인하지 못했습니다"
            : event.code === "NAVIGATION_UNVERIFIED"
              ? "페이지 이동 결과를 확인하지 못했습니다"
              : "작업 결과를 확인할 수 없습니다";
    const item = card(
      ctx.document,
      event.code === "GOAL_INCOMPLETE" ? "info" : "error",
      title,
      text,
    );
    const guidance = ctx.document.createElement("p");
    guidance.className = "failure-guidance";
    guidance.textContent = failureHelp(event.code).guidance;
    item.append(guidance);
    const actions = actionRow(ctx.document, item);
    actions.append(
      button(ctx.document, "진단 보기", "", () =>
        openPanelDiagnostics(ctx.document),
      ),
      button(ctx.document, "진단 다운로드", "primary", () =>
        downloadPanelDiagnostics(ctx.document),
      ),
    );
    ctx.append(item);
    ctx.status(text);
  }
  return { active: false, text: "" };
}

export function setPanelBusy(send: HTMLButtonElement, value: boolean) {
  send.dataset.state = value ? "stop" : "send";
  send.type = value ? "button" : "submit";
  send.disabled = false;
  send.setAttribute("aria-label", value ? "중지" : "보내기");
  send.title = value ? "중지" : "보내기";
}
