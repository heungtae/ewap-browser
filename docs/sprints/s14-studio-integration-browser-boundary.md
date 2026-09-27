# S14 — Browser 로컬 기록 워크플로우 비교 (Completed)

## 목표와 소유권

Studio Capture session/token, L0~L6 gate, baseline, Change Detector, dependency
graph, Impact Analyzer, release 판정은 Platform 소유다. 이번 `Completed`는
Browser가 기록된 워크플로우를 현재 페이지와 비교하고 실행 권한을 막는
로컬 경계만 뜻한다. Browser의
`semantic-projection-fp-v1`과 Platform의 `semantic-v1`은 직접 비교할 수 없다.

## 완료 카드

| 카드 | 종료 조건 | 판정 |
| --- | --- | --- |
| S14-B1 | complete top-frame `all_dom`에서만 `verified`/`stale` 판정. 불완전 snapshot·잘못된 저장 fingerprint는 `incomparable`. exact path segment로 후보를 제한하고 선택·시작 시 재검사. 실제 Chrome Side Panel에서 세 상태와 재검사 차단 확인 | Completed |

## S14-B1 비교 계약

기록 시 저장한 fingerprint는 `semantic-projection-fp-v1`의 로컬 값이다.
현재 snapshot은 top frame, `all_dom` scope, `truncated=false`,
`node_count=nodes.length`, 최대 500개 node 조건을 만족해야 비교 가능하다.
scope/잘림/개수 표식이 누락된 snapshot도 비교 불가다. 기존 기록이 현재
페이지와 같다고도, 변경되었다고도 주장하지 않는다.
저장 fingerprint도 canonical 43자 base64url SHA-256 형식이어야 비교 가능하다.
경로 prefix는 segment 경계로 비교해 `/trend`가 `/trending`을 포함하지 않는다.

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

## 검증

[S14 종료 증거](../evidence/s14-closure-2026-09-27.md)의 단위 검증과
Chrome for Testing 147의 실제 Side Panel에서 `verified`, `stale`,
`incomparable` 후보 표시, 변경된 DOM의 선택·시작 차단을 확인했다.
Platform 소비 경로는 검증하지 않았다.

## 범위 경계

Studio Capture 관찰 handoff, C06/C07 공유 계약, Platform semantic-v1,
L0~L6 validation, 외부 L5 runner/ingest/receipt, Change Detector와 Impact
Analyzer는 현재 S14 완료 조건에서 삭제했다. 이 기능들의 구현·검증은
별도 Platform 작업이다. `studio/validation.ts`와 `studio/semantic-impact.ts`는
테스트용 함수이며 운영 Studio 서비스나 Browser 연동 완료 증거가 아니다.
