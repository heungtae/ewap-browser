# S7 — 범용 Browser Act와 기존 코드 완성

상태: **Completed** (2026-09-26, Linux Browser 로컬 범위).
[종료 증거](../evidence/s7-closure-2026-09-26.md).

## 목표

현재 [31번 Act 경로](../31-act-request-execution-current-implementation.md)의
generic proposal, 사용자 승인, bounded CDP/Content dispatch와 semantic
verifier를 두 개의 통제 HTTPS 일반 페이지에서 검증한다. 서명된 Profile에
action 정의가 있으면 그 정의를 action authority로 사용한다. 정의가
없을 때만 현재 페이지의 visible/enabled control에서 좁은 R1 기본 도구를
구성한다. Profile R2 선언은 페이지 기본 R1 도구로 낮춰지지 않는다.
Resolver 설정 자체가 없는 일반 페이지는 기본 도구를 사용할 수 있다.
설정된 Resolver의 서명·claim·네트워크 검증 실패는 action 경로를 닫는다.
페이지 기본 도구는 제안만으로 실행되지 않는다. 실행 전에 확인 가능한
postcondition이 없으면 dispatch 전 `FAILED`로 종료한다.

S7 `Completed`는 Linux Chrome for Testing의 Browser 로컬 범위다.
실제 회사 Provider·사이트, 배포 환경의 승인과 S6-R/S13 분석 수집은
종료 조건에 포함하지 않는다.

## 선행 조건

- S6 schema v2와 hidden/visible ref 분리가 완료됐다.
- S2의 permission, confirmation, target marker와 CDP unit test baseline이 green이다.

## 구현 범위

1. demo-specific `propose_select_option`/`propose_click`을 generic proposal registry로 이관
2. `click_by_ref`, `set_text_by_ref`, `select_option_by_ref`, `set_checked_by_ref`, `press_key_by_ref`, `navigate`
3. model ref one-time resolve와 hidden target mutation 거부
4. user-owned text value slot과 Profile 공개 option enum
5. capability/risk/confirmation/action definition registry
6. DOM vs bounded CDP preflight selection
7. `BoundedCdpAdapter` service-worker instantiation과 marker/session recovery
8. semantic/navigation postcondition verifier
9. Stop, navigation, tab close와 worker restart cleanup
10. Chat action timeline과 `VERIFIED/FAILED/UNKNOWN/CANCELLED` UX

## 코드 참고 원칙

Claude bundle에서 관찰한 ref-to-box, trusted input, tab lifecycle과 UI progress behavior는 fixture expectation으로만 사용한다. 코드·문구·asset은 복사하지 않는다. 기존 ContextPilot의 semantic ref registry, mutation coordinator, DOM executor, bounded CDP builder, marker recovery와 verifier는 파일별 inventory 후 재사용·연결하는 작업을 이 Sprint에 포함한다. ContextPilot은 model coordinate를 받지 않으며 action token, hit-test, closed command builder와 no-retry 계약을 유지한다.

## 구현 카드

| 카드   | 산출물                          | 종료 조건                                           |
| ------ | ------------------------------- | --------------------------------------------------- |
| S7-C0  | foundation inventory/wiring map | 기존 구현의 dead path, gap, reuse 대상과 owner 확정 |
| S7-C1  | generic action definitions      | Profile/core registry 외 tool 거부                  |
| S7-C2  | proposal/resolve bridge         | run/model/document one-time binding                 |
| S7-C3  | value slot UI/runtime           | raw value provider/storage/audit 부재               |
| S7-C4  | DOM executor completion         | select/check/text/click post-state check            |
| S7-C5  | bounded CDP wiring              | normal Act에서 trusted input evidence               |
| S7-C6  | verifier engine                 | declared postcondition 없는 success 금지            |
| S7-C7  | lifecycle recovery              | Stop/navigation/restart detach leak 0               |
| S7-C8  | navigation tool                 | normalized URL, beforeunload와 redirect check       |
| S7-C9  | action Chat UX                  | permission/value/confirmation/outcome timeline      |
| S7-C10 | multi-fixture Chrome E2E        | 서로 다른 두 일반 HTTPS fixture의 실제 Side Panel·Provider·승인·결과 |

## 완료 조건

- 현재 [18번 ACT 검증계획](../18-claude-browser-capability-verification-plan.md)의
  적용 가능한 positive/negative 항목을 unit과 Chrome로 판정하고 제외
  범위를 증거에 명시
- `BoundedCdpAdapter`가 실제 Act chat에서 호출된 trace
- DOM/CDP dispatch 이후 fallback과 자동 retry 0
- `VERIFIED`마다 실제 semantic/navigation postcondition evidence 존재
- sensitive/hidden/stale/cross-tab target dispatch 0
- 모든 terminal path에서 attached product session 0, detach failure quarantine
- demo 경로도 generic registry 위에서 regression 통과
- 상태 원장에 실제 Chrome evidence 연결. commit은 별도 요청이 있을 때 기록
