# S5 — Chat Workspace UI

## 목표와 종료 범위

[31번 Act](../31-act-request-execution-current-implementation.md)과
[33번 Ask](../33-ask-request-execution-current-implementation.md)의 현재 Browser
경로에서 Service Worker가 발행한 closed `ChatEvent`만 Side Panel에 표시한다.
중복·누락·연결 끊김을 복구하고 Stop 뒤 늦게 도착한 결과가 화면이나 승인 권한을
되살리지 않게 한다. S0~S9의 Linux 로컬 종료 범위는
[Sprint 설계 인덱스](../sprint-design.md)를 따른다.

Screenshot payload·좌표 annotation, Claude artifact 동등성, 전체 번역 교체,
외부 접근성 인증과 운영 Provider 결과는 현재 `ChatEvent`/31·33번 Browser
경로의 종료 조건에서 제외한다. 안전한 schema 없이 이미지 카드나 좌표 입력을
추가하지 않는다.

## 선행 조건과 허용 파일군

- S1 Ask, S2 승인/결과 확인, S3 Provider stream/Stop, S4 Settings 경계가
  현재 build에서 동작한다.
- `extension/src/sidepanel/**`, `extension/src/contracts/chat-events*`,
  해당 unit·Chrome fixture, build script만 S5에서 변경한다.
- Provider wire format, mutation policy, CDP command allowlist는 유지한다.

## 구현·검증 계약

| 카드 | Browser 경계 | 종료 증거 |
| --- | --- | --- |
| S5-C0~C2 | 현재 Panel component 재사용, event variant별 closed field, tab/run sequence, `CHAT_RESYNC`/`CHAT_RECOVER` | extra/wrong-tab/wrong-run/duplicate/gap 음성 검사, 실제 worker 재시작 |
| S5-C3~C5 | 1,000 DOM 항목 상한, 읽던 위치 보존, delta batch, 순서 있는 tool timeline | 실제 HTTPS Provider의 1글자 SSE delta 1,000개, Panel의 교차 tool event, 1,100 항목 상한·scroll anchor |
| S5-C6 | review·permission·value·R2 confirmation 만료와 Stop | 즉시 Stop 상태, 카드 비활성화, raw value 제거, late delta/tool 무시 |
| S5-C8 | 안전한 오류·진단 표시 | `UNKNOWN` 성공 문구 금지, stale target의 새 Ask 읽기 CTA, secret/raw value 비노출 |
| S5-C9~C10 | permission badge, native dialog, keyboard, 좁은 폭, 복구 | 실제 Side Panel 320 CSS px·200% page scale, dialog focus/Escape, worker 재시작·실행 중 Panel 닫기/재열기 |

S5-C7로 표기됐던 screenshot/annotation 카드는 이 Browser 경로에 해당하는
안전한 event payload가 없으므로 이번 종료 카드에서 삭제한다. 현재 UI의
ko-KR 문구와 기존 안전한 error mapping을 사용하며 전체 en-US 번역은
후속 UI 범위다.

[18번 검증계획](../18-claude-browser-capability-verification-plan.md)의
UI-001~010은 아래와 같이 현재 경로에서 판정한다. UI-001은 실제 Provider,
UI-003~004는 실제 Chrome worker/Panel, UI-002·005~010의 늦은·잘못된
event는 실제 Panel 문서에 통제된 `ChatEvent`를 주입해 음성 검증한다.
UI-007의 Provider 연결 취소는 S3 fixture로도 확인하고, UI-008의 실제
permission·R2 dispatch 중단은 S2 증거와 함께 판정한다.

## 완료 조건

- 위 카드와 UI-001~010에 대한 현재 build의 단위·fixture·실제 Chrome
  증거를 `docs/evidence/s5-closure-2026-09-25.md`에 기록한다.
- Stop 뒤 delta/tool event와 오래된 승인 카드가 transcript/권한을 바꾸지
  않는다. permission badge는 실제 `run_started` mode를 따른다.
- 진단·오류·UI에 credential, raw action value, provider wire object를
  출력하지 않는다.
- worker 재시작과 실행 중 Panel 닫기/재열기 뒤 기록 또는 명시적 실패가
  보인다. source 기반 UI 확인만으로 `Completed`를 선언하지 않는다.
- `docs/sprint-progress.md`에 완료 판정과 증거를 연결한다.
