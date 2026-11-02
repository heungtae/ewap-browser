import type { PanelEvent } from "@contextpilot/shared/bridge";
import { card, actionRow, button, type PanelCards } from "./panel-dom.js";
import { actionSummary } from "./panel-action-summary.js";
type ActionEvent = Extract<PanelEvent, { action: object }>;
export function renderActionCard(ctx: PanelCards, event: ActionEvent) {
  const { document, respond } = ctx;
  let item: HTMLElement;
  if (event.type === "action_review_required") {
    const action = event.action;
    item = card(
      document,
      "review",
      action.tool === "submit_plan" ? "계획 검토" : "작업 제안",
      actionSummary(action),
    );
    const row = actionRow(document, item);
    row.append(
      button(
        document,
        action.tool === "submit_plan"
          ? "계획 승인"
          : action.approval_scope === "session"
            ? "한 번 승인하고 계속 실행"
            : "이번 단계 실행",
        "primary",
        () => {
          void respond(event, { kind: "review", decision: "approve" });
        },
      ),
      button(document, "중단", "danger", () => {
        void respond(event, { kind: "review", decision: "reject" });
      }),
    );
    ctx.status("작업 제안을 검토해 주세요.");
  } else if (event.type === "permission_required") {
    const operation = {
      type: "입력",
      navigate: "화면 전환",
      page_method: "페이지 메서드 호출",
      click: "클릭",
    }[event.capability];
    item = card(
      document,
      "permission",
      "권한 확인",
      event.host + "에서 " + operation + " 작업을 허용할까요?",
    );
    const row = actionRow(document, item);
    const decide = (decision: "once" | "always" | "deny") => {
      void respond(event, { kind: "permission", decision });
    };
    row.append(
      button(document, "이번만 허용", "primary", () => decide("once")),
    );
    if (event.capability !== "page_method")
      row.append(button(document, "항상 허용", "", () => decide("always")));
    row.append(button(document, "거부", "danger", () => decide("deny")));
    ctx.status("실행 권한이 필요합니다.");
  } else if (event.type === "value_required") {
    item = card(
      document,
      "value",
      "값 입력",
      event.action.target_name +
        "에 적용할 " +
        (event.value_kind === "option" ? "옵션" : "값") +
        "을 확인해 주세요.",
    );
    const form = document.createElement("form"),
      input = document.createElement("input"),
      submit = document.createElement("button");
    form.className = "value-form";
    input.required = true;
    input.maxLength = 16384;
    input.autocomplete = "off";
    input.placeholder = "값을 입력하세요.";
    submit.className = "primary";
    submit.textContent = "적용";
    form.append(input, submit);
    form.onsubmit = (e) => {
      e.preventDefault();
      if (input.value)
        void respond(event, { kind: "value", value: input.value });
    };
    item.append(form);
    ctx.status("입력값을 확인한 뒤 적용해 주세요.");
  } else {
    item = card(
      document,
      "confirmation",
      "중요 작업 확인",
      event.action.target_name + " 작업은 추가 확인이 필요합니다.",
    );
    const row = actionRow(document, item);
    const decide = (decision: "accept" | "reject") => {
      void respond(event, {
        kind: "confirmation",
        decision,
        confirmationId: event.confirmation_id,
        nonce: event.confirmation_nonce,
      });
    };
    row.append(
      button(document, "확인하고 실행", "primary", () => decide("accept")),
      button(document, "중단", "danger", () => decide("reject")),
    );
    ctx.status("중요 작업을 확인해 주세요.");
  }
  ctx.append(item);
  ctx.register(event, item);
  if (event.type === "value_required") item.querySelector("input")?.focus();
}
