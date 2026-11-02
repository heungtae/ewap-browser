import type { PanelEvent, PanelResponse } from "@contextpilot/shared/bridge";
export type DecisionEvent = Extract<PanelEvent, { prompt: object }>;
export type PanelReply = PanelResponse extends infer R
  ? R extends PanelResponse
    ? Omit<R, "runId" | "prompt">
    : never
  : never;
export interface PanelCards {
  document: Document;
  append(node: HTMLElement): void;
  status(text: string): void;
  respond(event: DecisionEvent, response: PanelReply): Promise<void>;
  register(event: DecisionEvent, card: HTMLElement, allowed?: boolean): void;
}
export function card(
  document: Document,
  kind: string,
  title: string,
  detail: string,
) {
  const item = document.createElement("article");
  item.className = "event-card";
  item.dataset.kind = kind;
  const heading = document.createElement("div"),
    label = document.createElement("b"),
    state = document.createElement("span"),
    body = document.createElement("div");
  heading.className = "event-heading";
  label.textContent = title;
  state.className = "tool-state";
  body.className = "event-detail";
  body.textContent = detail;
  heading.append(label, state);
  item.append(heading, body);
  return item;
}
export function actionRow(document: Document, item: HTMLElement) {
  const row = document.createElement("div");
  row.className = "card-actions";
  item.append(row);
  return row;
}
export function button(
  document: Document,
  text: string,
  kind: string,
  action: () => void,
) {
  const control = document.createElement("button");
  control.type = "button";
  control.textContent = text;
  control.className = kind;
  control.onclick = action;
  return control;
}
export function lockCard(item: HTMLElement, stateText: string) {
  for (const field of item.querySelectorAll<
    HTMLInputElement | HTMLButtonElement
  >("button,input,select,textarea")) {
    field.disabled = true;
    if (field instanceof item.ownerDocument.defaultView!.HTMLInputElement)
      field.value = "";
  }
  item.dataset.decision = "locked";
  item.setAttribute("aria-busy", "false");
  const state = item.querySelector(".tool-state");
  if (state) state.textContent = stateText;
}
