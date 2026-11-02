import {
  panelEventSchema,
  type PanelClient,
} from "@contextpilot/shared/bridge";
import { runStartView, terminalView } from "./panel-state-view.js";
import type { PresentationView } from "./view.js";
import { PanelStatus } from "./panel-status.js";
import { PanelTranscript } from "./panel-transcript.js";
import { PanelDecisions } from "./panel-decisions.js";
import { mountPanelControls } from "./panel-controls.js";
import { renderActionCard } from "./panel-action-cards.js";
import { renderConsentCard } from "./panel-consent-card.js";
import { renderWorkflowCard } from "./panel-workflow-cards.js";
import { type PanelCards } from "./panel-dom.js";
export function createPanelView(
  document: Document,
  root: HTMLElement,
): PresentationView {
  const transcript = new PanelTranscript(document, root);
  const feedback = new PanelStatus(document);
  const status = feedback.status,
    setActivity = feedback.activity;
  const send = document.getElementById("chat-send") as HTMLButtonElement;
  let runId: string | undefined,
    requestId: string | undefined,
    busy = false,
    mode: "ask" | "act" = "ask",
    connected = false;
  const ended = new Set<string>();
  const setBusy = (value: boolean) => {
    busy = value;
    send.dataset.state = value ? "stop" : "send";
    send.type = value ? "button" : "submit";
    send.disabled = false;
    send.setAttribute("aria-label", value ? "중지" : "보내기");
    send.title = value ? "중지" : "보내기";
  };
  const decisions = new PanelDecisions(
    status,
    (id) => runId === id && !ended.has(id),
  );
  const ctx: PanelCards = {
    document,
    append: (node) => transcript.append(node),
    status,
    respond: (event, reply) => decisions.respond(event, reply),
    register: (event, item, allowed = true) => {
      const needsAct = event.type !== "source_consent_required";
      decisions.register(event, item, allowed && (!needsAct || mode === "act"));
    },
  };
  const clear = () => {
    decisions.lock();
    transcript.clear();
    runId = undefined;
    requestId = undefined;
    ended.clear();
    setBusy(false);
    setActivity();
    status("새 대화를 시작했습니다.");
  };
  let unbind: (() => void) | undefined;
  return {
    status,
    message: (text) => {
      transcript.message(text);
    },
    bind(client?: PanelClient) {
      unbind?.();
      transcript.attach();
      decisions.client = client;
      unbind = mountPanelControls(document, {
        client: () => decisions.client,
        connected: () => connected,
        busy: () => busy,
        request: () =>
          requestId ? { requestId, ...(runId ? { runId } : {}) } : undefined,
        pending(id) {
          requestId = id;
          runId = undefined;
          setBusy(true);
          status("응답을 기다리는 중입니다.");
        },
        stopping() {
          decisions.lock("중단 중");
          send.disabled = true;
          send.setAttribute("aria-label", "중단 중");
          send.title = "중단 중";
          status("작업 중단을 요청했습니다.");
          setActivity("중단 결과를 확인하는 중입니다.");
        },
        clear,
        status,
      });
      return () => {
        unbind?.();
        unbind = undefined;
        connected = false;
        decisions.connected = false;
        decisions.lock("연결 확인 필요");
        transcript.dispose();
      };
    },
    connection(text, available) {
      connected = available;
      decisions.connected = available;
      if (!available && decisions.lock("연결 확인 필요"))
        status("최신 요청 상태를 확인한 뒤 다시 응답해 주세요.");
      feedback.connection(text, available);
    },
    event(raw) {
      const event = panelEventSchema.parse(raw);
      if (event.type === "run_started") {
        if (ended.has(event.runId)) return;
        decisions.lock("처리됨");
        runId = event.runId;
        requestId = event.requestId;
        mode = event.mode;
        setBusy(true);
        setActivity(runStartView(ctx, event));
        return;
      }
      if (
        event.runId !== runId ||
        event.requestId !== requestId ||
        ended.has(event.runId)
      )
        return;
      if (event.type === "message") {
        transcript.message(event.text, event.role);
        return;
      }
      if (event.type === "assistant_delta") {
        transcript.delta(event.runId, event.text);
        return;
      }
      if (event.type === "activity") {
        status(event.text);
        setActivity(event.finished ? undefined : event.text);
        return;
      }
      if (event.type === "tool") {
        decisions.lock("실행 중");
        transcript.tool(
          `${event.runId}:${event.id}`,
          event.label,
          event.summary,
          event.outcome,
        );
        return;
      }
      if ("action" in event) {
        renderActionCard(ctx, event);
        return;
      }
      if (event.type === "source_consent_required") {
        renderConsentCard(ctx, event);
        return;
      }
      if (
        event.type === "workflow_candidates" ||
        event.type === "workflow_preview" ||
        event.type === "workflow_code_consent"
      ) {
        setBusy(false);
        setActivity();
        renderWorkflowCard(ctx, event);
        return;
      }
      const terminal = terminalView(ctx, event);
      decisions.lock(
        terminal.active
          ? "화면 확인 중"
          : event.outcome === "CANCELLED"
            ? "중단됨"
            : "완료",
      );
      if (terminal.active) {
        setActivity(terminal.text);
        return;
      }
      ended.add(event.runId);
      if (ended.size > 256) ended.delete(ended.values().next().value!);
      transcript.end(event.runId);
      setBusy(false);
      setActivity();
    },
  };
}
