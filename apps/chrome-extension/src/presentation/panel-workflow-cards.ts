import type { PanelEvent } from "@contextpilot/shared/bridge";
import { appendWorkflowCandidateEvidence } from "../../../../extension/src/sidepanel/workflow-candidate-evidence.js";
import { card, actionRow, button, type PanelCards } from "./panel-dom.js";
type WorkflowEvent = Extract<
  PanelEvent,
  { type: "workflow_candidates" | "workflow_preview" | "workflow_code_consent" }
>;
export function renderWorkflowCard(ctx: PanelCards, event: WorkflowEvent) {
  const document = ctx.document;
  let item: HTMLElement;
  if (event.type === "workflow_candidates") {
    item = card(
      document,
      "review",
      "워크플로우 보기",
      event.appendOnly
        ? "코드 분석 결과는 이번 실행에만 사용할 수 있습니다."
        : "출처와 페이지 결속 상태를 확인하고 검토할 후보를 선택하세요. 요청 적합성은 아직 검토되지 않았습니다.",
    );
    item.dataset.workflowSelectionId = event.prompt.id;
    const divider = () => {
      const line = document.createElement("hr");
      line.className = "workflow-divider";
      item.append(line);
    };
    divider();
    for (const candidate of event.candidates) {
      const { runtime_kind, ...plain } = candidate;
      appendWorkflowCandidateEvidence(
        item,
        runtime_kind ? { ...plain, runtime_kind } : plain,
      );
      const blocked =
        candidate.status === "stale" || candidate.status === "incomparable";
      const label =
        candidate.source === "profile"
          ? "Profile"
          : candidate.source === "recorded"
            ? "기록"
            : candidate.runtime_kind === "code-analysis"
              ? "코드 초안"
              : "페이지 제공";
      const row = actionRow(document, item);
      const select = button(
        document,
        blocked
          ? `${candidate.title} · ${label} · ${candidate.status === "stale" ? "페이지 변경됨" : "페이지 비교 불가"}`
          : `${candidate.title} · ${label} · ${candidate.step_count}단계 검토할 후보 선택`,
        blocked ? "" : "primary",
        () => {
          if (!blocked)
            void ctx.respond(event, {
              kind: "workflow.select",
              candidateId: candidate.id,
            });
        },
      );
      select.disabled = blocked;
      row.append(select);
    }
    if (!event.appendOnly) {
      divider();
      const row = actionRow(document, item);
      row.append(
        button(document, "페이지 코드로 초안 만들기", "warning", () => {
          void ctx.respond(event, { kind: "workflow.previewCode" });
        }),
        button(document, "일반 한 단계 실행", "", () => {
          void ctx.respond(event, { kind: "workflow.dismiss" });
        }),
      );
    }
    ctx.status("워크플로우 후보를 선택해 계획을 확인해 주세요.");
  } else if (event.type === "workflow_preview") {
    const candidate = event.candidate;
    item = card(
      document,
      "review",
      "워크플로우 계획 확인",
      `${candidate.title} · ${candidate.detail}\n${candidate.origin}${candidate.path_prefix} · ${candidate.step_count}단계`,
    );
    const row = actionRow(document, item);
    row.append(
      button(document, "분석 시작", "primary", () => {
        void ctx.respond(event, { kind: "workflow.start" });
      }),
    );
    if (candidate.source === "runtime")
      row.append(
        button(document, "내 워크플로우로 저장", "", () => {
          const title = document.defaultView?.prompt(
            "저장할 워크플로우 이름",
            candidate.title,
          );
          if (title?.trim())
            void ctx.respond(event, {
              kind: "workflow.save",
              candidateId: candidate.id,
              title: title.trim(),
            });
        }),
      );
    ctx.status("계획을 확인한 뒤 분석 시작을 선택해 주세요.");
  } else {
    item = card(
      document,
      "confirmation",
      "페이지 코드 분석 동의",
      `스크립트 ${event.script_count}개(${event.inline_chars.toLocaleString()}자 inline)를 선택한 provider에 전달합니다. 출처: ${event.origins.join(", ") || "inline only"}`,
    );
    const row = actionRow(document, item);
    row.append(
      button(document, "코드 전송 후 초안 만들기", "warning", () => {
        void ctx.respond(event, { kind: "workflow.analyze", consent: true });
      }),
      button(document, "취소", "danger", () => {
        void ctx.respond(event, { kind: "workflow.dismiss" });
      }),
    );
  }
  ctx.append(item);
  ctx.register(
    event,
    item,
    event.type !== "workflow_preview" ||
      !["stale", "incomparable"].includes(event.candidate.status),
  );
}
