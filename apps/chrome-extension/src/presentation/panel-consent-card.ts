import type { PanelEvent } from "@contextpilot/shared/bridge";
import { card, actionRow, button, type PanelCards } from "./panel-dom.js";
type Consent = Extract<PanelEvent, { type: "source_consent_required" }>;
export function renderConsentCard(ctx: PanelCards, event: Consent) {
  const titles = {
    source: "페이지 소스 전달 동의",
    "component-scroll": "Component 스크롤 읽기 승인",
    "component-vision": "화면 이미지 전달 동의",
    "runtime-methods": "페이지 메서드 목록 전달 동의",
    "jev-decision": "Jev 판단 서비스 전달 동의",
    "runtime-result": "페이지 메서드 반환 자료 전달 동의",
  };
  const texts = {
    source: `${event.host}의 script ${event.resource_count}개를 마스킹한 뒤 모델에 전달할까요? 소스를 실행하지 않습니다.`,
    "component-scroll": `${event.host}의 선택한 component를 제한된 스크롤로 읽고 원래 위치로 복구합니다. 수집 범위와 복구 결과를 확인합니다.`,
    "component-vision": `${event.host}의 현재 화면 이미지를 모델에 전달합니다. Chrome 화면 캡처 권한도 요청합니다. 민감한 화면은 지원하지 않으며 이미지를 동작 좌표로 사용하지 않습니다.`,
    "runtime-methods": `${event.host}에서 확인한 메서드 이름·경로·인자 수를 모델에 전달합니다. 페이지 메서드 실행은 별도의 검토를 거칩니다.`,
    "jev-decision": `현재 요청에 필요한 페이지·결과 정보를 마스킹한 뒤 ${event.host}의 Jev 판단 서비스로 전달합니다. 기존 모델의 전달 동의와 별도로 적용됩니다.`,
    "runtime-result": `${event.host}의 페이지 메서드 반환 자료를 제한·마스킹한 뒤 모델에 전달합니다.`,
  };
  const item = card(
      ctx.document,
      "permission",
      titles[event.purpose],
      texts[event.purpose],
    ),
    row = actionRow(ctx.document, item);
  const decide = (allowed: boolean) => {
    void ctx.respond(event, { kind: "consent", allowed });
  };
  row.append(
    button(ctx.document, "이번 요청에 허용", "primary", () => decide(true)),
    button(ctx.document, "거부", "danger", () => decide(false)),
  );
  ctx.append(item);
  ctx.register(event, item);
  ctx.status("페이지 소스 전달 동의가 필요합니다.");
}
