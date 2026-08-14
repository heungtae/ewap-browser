# S5 — Side Panel Operational UX

## 1. 설계 계획

- **목표:** 사용자가 current mode, origin/profile eligibility, action result, confirmation, Stop 상태를 정확히 이해하고 제어한다.
- **선행 조건:** S4 Done.
- **연계 요구사항:** RQ-04, RQ-05, RQ-06, RQ-10.
- **필요 ADR:** ADR-005/007/009의 UX 영향 재검토.
- **불변 조건:** UX는 policy를 대체하지 않는다. confirm UI는 R2 action summary와 deny/cancel을 명확히 제공하며, Stop은 pending work를 중단하고 debugger detach를 요청한다.
- **비범위:** provider/model 선택 UI, advanced generic browser control UI, autonomous background scheduling.

## 2. 개발 계획

| 순서 | 작업 | 산출물 | 책임 역할 |
|---|---|---|---|
| 1 | mode/origin/profile/degraded status information architecture를 설계 | side-panel state model | Product + UX |
| 2 | confirmation/denial/unknown result presentation을 설계 | interaction and accessibility spec | UX + Security |
| 3 | action timeline의 redacted event view를 설계 | timeline view contract | Extension + Privacy |
| 4 | Stop/cancellation and detach lifecycle을 연결 | stop state/lifecycle contract | Extension |
| 5 | minimal settings surface와 support messages를 정의 | settings/support specification | Product + Operations |

## 3. 검증 계획

| 수준 | 검증 항목 | 기대 결과 | 증적 |
|---|---|---|---|
| Component | mode/status/confirmation state rendering | policy state가 정확하고 secret가 표시되지 않음 | component tests |
| Accessibility | keyboard, focus, dialog announcement, color-independent status | confirmation/Stop이 보조기술로 사용 가능 | accessibility review |
| Browser E2E | ASK/ACT transitions, R2 approve/deny, unknown profile, Stop | state와 action 결과가 일치; Stop 뒤 detach | E2E evidence |
| Security | UI event injection/race with confirmation | UI만으로 policy bypass 불가 | negative test |

## 4. 종료 조건과 기록

- [x] mode/eligibility/confirmation/Stop의 UX와 accessibility 검토가 [review](S5-accessibility-review.md)로 완료됐다.
- [x] Stop-to-detach lifecycle contract가 있다; managed-browser lifecycle observation은 RC1 GO 조건이다.
- [x] RQ-04/05/06/10과 상태 기록부를 갱신했다.
