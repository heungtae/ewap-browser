# S14 — Studio Integration: Browser 관찰 경계

## 목표와 소유권

Studio Capture session/token, L0~L6 gate, baseline, Change Detector, dependency
graph, Impact Analyzer, release 판정은 Platform 소유다. Browser는 현재 페이지의
sanitized observation과 로컬 워크플로우 비교 결과를 제공한다. Browser의
`semantic-projection-fp-v1`과 Platform의 `semantic-v1`은 직접 비교할 수 없다.

## Browser 구현 카드

| 카드   | 범위                                     | 종료 조건                                                                                                                                                  |
| ------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S14-B1 | 기록된 워크플로우의 현재 projection 비교 | complete top-frame `all_dom` 관찰에서만 `verified`/`stale`을 판정하고, 잘림·범위 불일치·fingerprint 계산 실패는 `incomparable`로 표시하여 선택/실행을 차단 |
| S14-B2 | Studio Capture 관찰 handoff              | C06/C07의 versioned capture/telemetry schema와 별도 audience가 확정된 후, raw page/value/ref/token이 없는 bounded observation을 session에 결속             |
| S14-B3 | L5 runner evidence                       | 실제 Chrome/Extension/환경/fixture/시나리오 digest가 결속된 외부 validation worker와 Platform ingest/receipt 연결                                          |

## S14-B1 비교 계약

기록 시 저장한 fingerprint는 `semantic-projection-fp-v1`의 로컬 값이다.
현재 snapshot은 top frame, `all_dom` scope, `truncated=false`,
`node_count=nodes.length`, 최대 500개 node 조건을 만족해야 비교 가능하다.
scope/잘림/개수 표식이 누락된 snapshot도 비교 불가다. 기존 기록이 현재
페이지와 같다고도, 변경되었다고도 주장하지 않는다.

비교 가능하고 digest가 같으면 `verified`, 다르면 `stale`이다.
`incomparable`과 `stale`은 Panel에 서로 다른 이유로 표시하지만 둘 다
선택·시작할 수 없다. 불완전 snapshot에서는 새 기록의 fingerprint도 저장하지
않는다. 이 결과는 Browser 로컬 기록의 안전 경계이며
Platform의 semantic diff, regression selection 또는 release evidence가 아니다.
기록된 후보를 처음 표시한 뒤에도 DOM이 변할 수 있으므로 선택과 시작 시점에
저장된 fingerprint·enabled 상태를 현재 snapshot에 다시 대조한다. 재검사
실패는 `WORKFLOW_STATE_MISMATCH`로 닫는다.

사용자가 기본 읽기 범위를 `visible_only` 또는 `interactive`로 설정했다면
기록 비교는 `incomparable`이 된다. 기존 `saved_workflows_v1`에는 기록 당시
scope/completeness 표식이 없으므로 같은 digest도 Browser 로컬 일치만 뜻한다.
Platform evidence로 사용하려면 versioned 기록 migration과 C07 golden vector가
별도로 필요하다.

## 현재 구현 상태

S14-B1의 Browser 비교, Panel 표시와 선택·시작 재검사는 소스에 연결했다.
TypeScript/ESLint/변경 파일 포맷 검사를 통과했다. 실제 Chrome 동작과
Platform 소비 경로는 아직 검증되지 않았다.

## 완료 기준

S14 전체 완료에는 Platform capture ingest, C06/C07 공유 계약, Change/Impact
서비스, L0~L6 validation과 실제 L5 Chrome evidence가 필요하다. Browser
로컬 비교만으로 S14를 `Done`으로 바꾸지 않는다.
