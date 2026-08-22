# S7 — 범용 Browser Act와 기존 코드 완성

## 목표

반도체 demo에 한정된 Act chat을 signed/bundled Page Profile과 core tool registry가 허용한 일반 페이지 ref action으로 확장한다. 이미 구현된 mutation coordinator와 bounded CDP adapter를 정상 service-worker execution path에 연결하고 실제 verifier를 완성한다.

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
| S7-C10 | multi-fixture Chrome E2E        | demo 외 두 일반 fixture와 staging-equivalent UI     |

## 완료 조건

- ACT-NEG-001~014와 positive matrix 통과
- `BoundedCdpAdapter`가 실제 Act chat에서 호출된 trace
- DOM/CDP dispatch 이후 fallback과 자동 retry 0
- `VERIFIED`마다 실제 semantic/navigation postcondition evidence 존재
- sensitive/hidden/stale/cross-tab target dispatch 0
- 모든 terminal path에서 attached product session 0, detach failure quarantine
- demo 경로도 generic registry 위에서 regression 통과
- 상태 원장에 구현 commit과 실제 Chrome evidence 연결
