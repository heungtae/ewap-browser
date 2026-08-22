# S5 — Chat Workspace UI 완성도

## 목표

현재 단순 message list와 action review UI를 복구 가능한 Chat workspace로 교체한다. provider wire payload를 UI가 직접 해석하지 않고 service worker의 closed `ChatEvent` projection만 렌더링한다.

## 선행 조건

- S1의 Ask request와 S3/S4 provider runtime이 현재 build에서 동작한다.
- 기존 UI의 sender 검증, permission decision과 Stop message 계약을 inventory한다.
- 사용자 변경과 겹치는 Side Panel 파일은 구현 시작 전에 diff와 소유 범위를 확정한다.

## 구현 범위

1. 기존 Side Panel component/store/message/permission UI inventory와 재사용·교체 결정표
2. Claude artifact에서 관찰한 streaming/timeline/modal/recovery behavior parity fixture
3. run별 sequence를 가진 Chat event schema와 resync snapshot
4. virtualized conversation viewport와 scroll anchor
5. assistant streaming delta batching
6. read/action/error를 구분한 grouped tool timeline
7. screenshot/zoom card와 display-only annotation surface
8. tab context, plan, permission, value request와 R2 confirmation card/modal
9. header의 Ask/Act, model, page context와 permission-mode badge
10. 항상 접근 가능한 Stop과 terminal recovery action
11. safe debug detail projection과 secret scrubber
12. ko-KR/en-US locale, keyboard navigation, focus management와 responsive layout

Claude bundle의 code, 문구와 asset은 복사하지 않는다. 관찰된 UI 상태 전이와 interaction만 fixture로 고정하고, ContextPilot의 license가 확인된 기존 component와 utility는 계약 test를 통과하는 범위에서 직접 재사용·정리한다.

## 허용 파일군

- `extension/src/sidepanel/**`
- `extension/src/contracts/chat-events*`
- Chat event를 projection하는 `extension/src/service-worker/**`
- 해당 unit/fixture/Chrome E2E와 build script

provider transport, mutation policy와 CDP command allowlist 변경은 이 Sprint에 포함하지 않는다.

## 구현 카드

| 카드   | 산출물                           | 종료 조건                                       |
| ------ | -------------------------------- | ----------------------------------------------- |
| S5-C0  | 기존 UI inventory와 behavior map | 파일별 reuse/adapt/replace 결정 및 test ID 연결 |
| S5-C1  | `ChatEvent` closed schema        | unknown/extra field와 wrong run 거부            |
| S5-C2  | event store/resync               | duplicate/gap/reconnect test                    |
| S5-C3  | virtual transcript               | 1,000 item 성능 budget                          |
| S5-C4  | streaming renderer               | ordered delta와 Stop race test                  |
| S5-C5  | tool timeline                    | read grouping, mutation/error non-collapse      |
| S5-C6  | modal/value flows                | focus trap, expiry와 stale request 거부         |
| S5-C7  | screenshot/tab/plan cards        | lazy image lifecycle와 safe URL                 |
| S5-C8  | safe debug/diagnostics           | secret/raw ref/page content 부재                |
| S5-C9  | a11y/i18n/responsive             | axe, keyboard, 320px/200% zoom                  |
| S5-C10 | Chrome recovery E2E              | worker suspend와 panel reopen                   |

## 완료 조건

- [18. 검증계획](../18-claude-browser-capability-verification-plan.md)의 UI-001~010, 접근성·성능 gate 통과
- Stop 이후 provider delta/tool result가 transcript를 변경하지 않음
- permission-less badge가 실제 run mode와 불일치하지 않음
- UI 로그·debug detail·error에 provider/browser credential과 raw action value 없음
- 실제 Chrome에서 service worker suspend와 panel close/reopen 증적
- `docs/11-sprint-progress.md`에 commit, test와 Chrome evidence 연결

## 비완료 조건

React component snapshot만 있거나 source-based E2E만 통과한 경우, mock screenshot만 렌더링한 경우, 실제 worker recovery를 수행하지 않은 경우에는 `Done`으로 표시하지 않는다.
