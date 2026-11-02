import { renderMarkdown } from "../../../../extension/src/sidepanel/markdown.js";
import { card } from "./panel-dom.js";
const truncationMarker = "\n\n[응답이 길어 앞부분만 표시합니다.]";
const bounded = (text: string) =>
  text.length > 16000
    ? text.slice(0, 16000 - truncationMarker.length) + truncationMarker
    : text;
export class PanelTranscript {
  private streaming = new Map<string, { element: HTMLElement; text: string }>();
  private tools = new Map<string, HTMLElement>();
  private following = true;
  private scroll: HTMLElement | null;
  private onScroll = () => {
    const s = this.scroll;
    if (s) this.following = s.scrollHeight - s.scrollTop - s.clientHeight < 40;
  };
  constructor(
    private document: Document,
    private root: HTMLElement,
  ) {
    this.scroll = document.getElementById("chat-scroll");
    this.attach();
  }
  attach() {
    this.scroll?.addEventListener("scroll", this.onScroll);
  }
  append(item: HTMLElement) {
    this.document.getElementById("empty-state")?.setAttribute("hidden", "");
    this.root.append(item);
    while (this.root.children.length > 1000)
      this.root.firstElementChild?.remove();
    for (const [id, node] of this.tools)
      if (!node.isConnected) this.tools.delete(id);
    for (const [id, value] of this.streaming)
      if (!value.element.isConnected) this.streaming.delete(id);
    if (this.following && this.scroll)
      this.scroll.scrollTop = this.scroll.scrollHeight;
  }
  message(text: string, role: "user" | "assistant" = "assistant") {
    const element = this.document.createElement("article");
    element.className = "message";
    element.dataset.role = role;
    if (role === "assistant") renderMarkdown(element, bounded(text));
    else element.textContent = text.slice(0, 16000);
    this.append(element);
    return element;
  }
  delta(runId: string, text: string) {
    const old = this.streaming.get(runId);
    if (old) {
      if (old.text.endsWith(truncationMarker)) return;
      old.text = bounded(old.text + text);
      renderMarkdown(old.element, old.text);
      if (this.following && this.scroll)
        this.scroll.scrollTop = this.scroll.scrollHeight;
    } else
      this.streaming.set(runId, {
        element: this.message(text),
        text: bounded(text),
      });
  }
  tool(
    id: string,
    label: string,
    summary: string,
    outcome?: "VERIFIED" | "FAILED" | "UNKNOWN",
  ) {
    let element = this.tools.get(id);
    if (!element) {
      element = card(this.document, "tool", label, summary);
      this.tools.set(id, element);
      this.append(element);
    }
    element.querySelector(".event-detail")!.textContent = summary;
    const state = element.querySelector<HTMLElement>(".tool-state")!;
    state.textContent =
      outcome === "VERIFIED"
        ? "완료"
        : outcome === "UNKNOWN"
          ? "다시 읽기 필요"
          : outcome === "FAILED"
            ? "실패"
            : "실행 중";
    if (outcome) state.dataset.outcome = outcome;
  }
  end(runId: string) {
    this.streaming.delete(runId);
  }
  clear() {
    this.root.replaceChildren();
    this.streaming.clear();
    this.tools.clear();
    this.following = true;
    this.document.getElementById("empty-state")?.removeAttribute("hidden");
    if (this.scroll) this.scroll.scrollTop = 0;
  }
  dispose() {
    this.scroll?.removeEventListener("scroll", this.onScroll);
  }
}
