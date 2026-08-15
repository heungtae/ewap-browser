# S1 — Semantic Projection Preview

## 1. 목표와 종료 시 보이는 결과

외부 서비스와 mutation 없이 현재 Chrome 문서의 redacted semantic projection을 Side Panel에 preview한다. 종료 시 실제 DOM에서 role/name/state와 document-scoped `ref_id`를 만들고, navigation·문서 교체·worker 재시작 뒤 stale identity를 fail closed로 폐기해야 한다.

## 2. 착수 조건과 입력

- S0이 증거와 commit hash를 가진 `Completed`다.
- Chrome 최소 버전은 `MessageSender.documentId`와 `documentLifecycle`을 제공하는 106 이상이다.
- development policy의 `permission_origins`와 page-read origin fixture가 S0 permission 상한 안에서 확정됐다.

## 3. 포함 범위

- Side Panel → service worker → content script의 closed runtime message
- content-owned `DOCUMENT_REGISTER`와 Chrome sender 기반 tab/frame/document/lifecycle 검증
- DOM semantic projection collector, redactor, document epoch와 `ref_id` registry
- `read_semantic_projection`, `find_by_ref`, `read_page_summary`의 preview-only 경로
- managed/local/session storage를 `TRUSTED_CONTEXTS`로 잠그는 bootstrap gate
- page-read exact-origin gate, navigation/worker restart cancellation과 재등록

## 4. 명시적 제외와 feature gate

- Native Host, LLM, SSO, Page Profile resolver, Business MCP 호출
- production Ask와 모든 Act/mutation message
- browser AX node ID, raw DOM/HTML, 좌표, input value, password/OTP, closed shadow DOM
- resolver/Host mock을 production success처럼 사용하는 경로

S1에서는 preview만 연다. production Ask와 Act는 service worker와 content script 양쪽에서 `PROFILE_UNAVAILABLE` 또는 closed deny로 유지한다.

## 5. 핵심 설계 계약

1. content message의 `tab_id`/`frame_id` 주장은 권한 근거가 아니다. service worker는 `sender.tab.id`, `sender.frameId`, `sender.documentId`, 허용 lifecycle만 채택한다.
2. `document_epoch`는 content가 document start에 생성하되 service worker 내부에서는 authoritative sender document에 결속한다.
3. storage access level 잠금이 성공하기 전에는 run, registration 채택, audit access를 받지 않는다.
4. projection은 redacted role/name, 제한된 state capability와 relation만 포함한다. raw field value와 browser AX 전용 식별자는 포함하지 않는다.
5. `ref_id`는 현재 document/frame scope에서만 유효하다. navigation, frame 교체, competing registration, worker restart는 이전 ref와 run을 폐기한다.
6. preview origin 허용은 resolver/LLM egress 허용을 뜻하지 않는다.

## 6. 작업 패키지

| 카드 | 결과 | 대표 negative case |
|---|---|---|
| S1-1 | runtime schema와 authoritative sender validator | unknown kind, forged metadata, old/prerender/frozen document |
| S1-2 | collector, redactor, ref registry, 재등록 | raw value, late epoch, stale ref |
| S1-3 | exact-origin matcher와 policy validator | localhost/IP/file/permission 밖 origin |
| S1-4 | storage bootstrap과 preview UI/coordinator | 잠금 전 run, Host/resolver/LLM/mutation dispatch |

상세 파일 경계는 [12의 S1 카드](../12-low-cost-agent-implementation-spec.md#s1-카드)를 따른다.

## 7. 검증과 종료 증거

- unit에서 message schema, sender identity, origin, redaction, storage bootstrap, stale epoch를 검사한다.
- 실제 Chrome fixture에서 labelled control, navigation, dynamic replacement, worker restart와 stale ref를 검사한다.
- content script의 managed/local/session policy·audit 접근이 실패하고 service worker만 접근함을 증명한다.
- Host, resolver, LLM network와 mutation message가 존재하지 않음을 negative test로 고정한다.

정확한 검증 항목은 [10의 S1 검증](../10-sprint-verification-plan.md#3-s1-검증)을 따른다.

## 8. 종료와 S2 인계

S1은 preview E2E와 보안 negative 결과, 독립 commit hash가 상태 원장에 기록될 때만 `Completed`다. S2에는 sender-bound document identity, redacted projection/ref registry, exact-origin matcher와 storage bootstrap gate를 안정된 계약으로 넘긴다.

## 9. 설계 추적

- semantic projection과 상태 모델: [01](../01-architecture.md)
- Ask/page-read gate: [02](../02-security-policy.md)
- MV3 message·storage·ref 계약: [03](../03-extension-design.md)
- 데이터 최소화: [06](../06-data-audit-and-privacy.md)
- 개발 계획: [09의 S1](../09-sprint-development-plan.md#3-s1--semantic-projection-preview)
