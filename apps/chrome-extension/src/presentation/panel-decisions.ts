import {
  panelResponseSchema,
  type PanelClient,
} from "@contextpilot/shared/bridge";
import { lockCard, type DecisionEvent, type PanelReply } from "./panel-dom.js";
import {
  requestVisionPermission,
  type VisionPermissions,
} from "../../../../extension/src/sidepanel/vision-permission.js";
export class PanelDecisions {
  private generation = 0;
  private pending: { event: DecisionEvent; card: HTMLElement } | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  connected = false;
  client: PanelClient | undefined;
  constructor(
    private status: (text: string) => void,
    private current: (runId: string) => boolean,
  ) {}
  lock(text = "처리됨") {
    this.generation++;
    const previous = this.pending !== undefined;
    clearTimeout(this.timer);
    if (this.pending) lockCard(this.pending.card, text);
    this.pending = undefined;
    return previous;
  }
  register(event: DecisionEvent, card: HTMLElement, allowed = true) {
    this.lock("처리됨");
    if (
      !allowed ||
      !this.connected ||
      !this.client ||
      !this.current(event.runId) ||
      event.prompt.expiresAt <= Date.now() ||
      event.prompt.requestId !== event.requestId
    ) {
      lockCard(card, "새 상태 확인 필요");
      return;
    }
    this.pending = { event, card };
    this.timer = setTimeout(
      () => this.lock("만료됨"),
      Math.min(2147483647, event.prompt.expiresAt - Date.now()),
    );
  }
  async respond(event: DecisionEvent, response: PanelReply) {
    const live = () =>
      this.connected &&
      !!this.client &&
      this.pending?.event === event &&
      this.current(event.runId) &&
      event.prompt.expiresAt > Date.now();
    if (!live()) {
      this.status("요청이 변경되었습니다. 최신 상태를 확인해 주세요.");
      return;
    }
    if (
      response.kind === "consent" &&
      response.allowed &&
      event.type === "source_consent_required" &&
      event.purpose === "component-vision"
    ) {
      const permissions = (
        globalThis as typeof globalThis & {
          chrome?: { permissions?: VisionPermissions };
        }
      ).chrome?.permissions;
      response = {
        ...response,
        allowed: await requestVisionPermission(permissions),
      };
    }
    if (!live()) return;
    const parsed = panelResponseSchema.safeParse({
      ...response,
      runId: event.runId,
      prompt: event.prompt,
    });
    if (!parsed.success) {
      this.status("입력값을 확인해 주세요.");
      return;
    }
    const value = parsed.data;
    const item = this.pending!.card;
    this.lock("응답 전달 중");
    const generation = this.generation;
    item.dataset.decision =
      response.kind === "review" ? response.decision : "pending";
    item.setAttribute("aria-busy", "true");
    this.status("응답을 전달하는 중입니다.");
    try {
      await this.client!.respond(value);
      if (this.generation !== generation || !this.connected) return;
      if (item.isConnected) item.setAttribute("aria-busy", "false");
      // Acknowledgement is not approval, execution, or verified completion.
    } catch {
      if (this.generation !== generation || !this.connected) return;
      if (item.isConnected) item.setAttribute("aria-busy", "false");
      this.status(
        "응답 전달 결과를 확인하지 못했습니다. 최신 상태를 기다려 주세요.",
      );
    }
  }
}
