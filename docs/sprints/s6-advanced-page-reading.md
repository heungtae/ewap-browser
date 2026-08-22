# S6 — Hidden DOM·Vision·Tab 고급 읽기

## 목표

hidden DOM을 기본 포함하는 schema v2 page projection, focused read, 본문 추출, find, screenshot/zoom, tab context와 read-only batch를 구현한다.

## 선행 조건

- S5 Chat event/timeline이 tool progress와 image result를 안정적으로 표시한다.
- 기존 semantic fingerprint, document registration과 model-ref lifecycle test가 green이다.

## 구현 범위

1. `PageReadScope=all_dom|visible_only|interactive`, 기본 `all_dom`
2. visibility/hidden reason을 가진 schema v2 node
3. frame당 2,000/전체 5,000 node, depth/character cap과 focus read
4. input value, credential, URL query/fragment와 executable DOM redaction
5. article/main 중심 `get_page_text`
6. deterministic-first, optional small-model rerank `find`
7. typed `VisionCaptureAdapter`의 viewport screenshot과 zoom
8. managed tab-group `tabs_context`
9. 최대 8개 read-only item의 `read_batch`
10. Chat timeline renderer와 tool schema 연결

## 허용 파일군

- `extension/src/content/**`
- `extension/src/contracts/**`
- `extension/src/service-worker/**`
- `extension/src/cdp/vision-*`
- `extension/src/policy/tool-registry.ts`
- S5가 만든 read tool renderer
- 해당 tests, fixtures와 Chrome scripts

mutation command allowlist와 permission skip behavior는 변경하지 않는다.

## 구현 카드

| 카드   | 산출물                  | 종료 조건                                       |
| ------ | ----------------------- | ----------------------------------------------- |
| S6-C1  | schema v2/migration     | v1 compatibility와 closed validation            |
| S6-C2  | all-DOM collector       | hidden reason matrix와 sensitive redaction      |
| S6-C3  | ref/depth/truncation    | focused subtree와 absolute caps                 |
| S6-C4  | `get_page_text`         | article fixture와 empty/canvas error            |
| S6-C5  | deterministic `find`    | hidden/visible ranking과 fabricated-ref 거부    |
| S6-C6  | Vision adapter          | only `Page.captureScreenshot`, resize/crop caps |
| S6-C7  | tab coordinator         | group ownership과 URL redaction                 |
| S6-C8  | read batch              | no mutation/nesting, cancel/size/time cap       |
| S6-C9  | provider/UI integration | untrusted boundary와 result ordering            |
| S6-C10 | Chrome/security E2E     | credential/prompt-injection/large-page suite    |

## 완료 조건

- READ-001~017, SEC-READ-001~010, FIND-001~010, VIS-001~012와 tab/batch gate 통과
- 초기 Ask request와 `read_page` 기본 scope 모두 `all_dom`
- hidden node는 모델에서 식별 가능하지만 mutation executor call count 0
- screenshot/page tree가 storage, audit, diagnostics와 export에 남지 않음
- cross-origin frame와 closed shadow DOM 경계 확인
- artifact/license 독립 구현 검토와 package exclusion check
- 실제 Chrome evidence와 상태 원장 연결
