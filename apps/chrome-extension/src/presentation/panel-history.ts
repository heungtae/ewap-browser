import {
  taskHistoryStateSchema,
  type TaskHistoryState,
} from "@contextpilot/shared/bridge";
import { card } from "./panel-dom.js";
export class PanelHistory {
  private last: TaskHistoryState | undefined;
  private entries = new Map<
    string,
    { state: TaskHistoryState; element: HTMLElement }
  >();
  constructor(
    private document: Document,
    private append: (item: HTMLElement) => void,
    private feedback: {
      status(text: string): void;
      activity(text?: string): void;
    },
  ) {}
  clear() {
    this.entries.clear();
    this.last = undefined;
  }
  show(raw: TaskHistoryState | null, dispatchUnknown: boolean, gap: boolean) {
    if (raw === null) {
      if (this.last) this.renderStatus(this.last);
      return;
    }
    const state = taskHistoryStateSchema.parse(raw);
    for (const [id, value] of this.entries)
      if (!value.element.isConnected) this.entries.delete(id);
    const prior = this.entries.get(state.id);
    if (prior && prior.state.revision > state.revision)
      throw Error("HISTORY_STALE");
    if (
      prior &&
      prior.state.revision === state.revision &&
      JSON.stringify(prior.state) !== JSON.stringify(state)
    )
      throw Error("HISTORY_CONFLICT");
    const labels = {
      accepted: "대기 중",
      running: "실행 중",
      waiting_user: "응답 대기",
      suspended: "일시 중지",
      completed: "종료",
      failed: "실패",
      cancelled: "취소됨",
    };
    let element = prior?.element;
    if (!element) {
      if (this.entries.size >= 128) throw Error("HISTORY_LIMIT");
      element = card(this.document, "task-history", "작업 상태", "");
      element.dataset.taskId = state.id;
      this.append(element);
    }
    element.dataset.revision = String(state.revision);
    element.querySelector(".tool-state")!.textContent = labels[state.phase];
    element.querySelector(".event-detail")!.textContent = [
      gap
        ? "이전 이벤트 일부가 보존되지 않아 현재 작업 상태를 복구했습니다."
        : "현재 작업 상태를 확인했습니다.",
      dispatchUnknown
        ? "실행 결과는 아직 확인되지 않았습니다."
        : state.actionVerified
          ? "작업 동작은 검증되었습니다."
          : "검증된 작업 동작은 없습니다.",
      state.goal === "verified"
        ? "목표 달성은 검증되었습니다."
        : state.goal === "incomplete"
          ? "목표가 아직 완료되지 않았습니다."
          : "목표 달성은 미확인입니다.",
      state.phase === "waiting_user"
        ? "새 응답 요청을 확인하세요. 이전 입력은 재사용하지 않습니다."
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    this.entries.set(state.id, { state, element });
    this.last = state;
    this.renderStatus(state);
  }
  private renderStatus(state: TaskHistoryState) {
    const labels = {
      accepted: "대기 중",
      running: "실행 중",
      waiting_user: "응답 대기",
      suspended: "일시 중지",
      completed: "종료",
      failed: "실패",
      cancelled: "취소됨",
    };
    const caption = `작업 상태: ${labels[state.phase]}`;
    if (this.document.getElementById("status")?.textContent !== caption)
      this.feedback.status(caption);
    this.feedback.activity(
      state.state === "SUSPENDED"
        ? "작업 일시 중지"
        : state.state === "TERMINAL"
          ? undefined
          : "최신 작업 상태 확인 중",
    );
  }
}
