# Act 이동 후 목표 완료 판단 수정 검증 — 2026-10-11

[ISS-20261011-001](../issues/records/2026-10-11-act-completion-after-navigation.md)의
P1~P5 구현과 R01~R14 회귀 결과다. 현재 동작의 SSOT는 링크한 코드·계약·테스트다.

## revision과 환경

- 기준 HEAD: `549ebacc76b5608d80ca70ab71610da11bbc29f0`.
- 검증 대상: 위 HEAD에 이 세션의 미커밋 수정이 적용된 작업 트리. 수정 commit은 없다.
- extension: `0.1.99`. 작업 전부터 있던 package/manifest/compatibility 버전 변경을 보존했다.
  버전을 올리는 `pnpm build` 대신 버전 유지 build를 사용했다.
- Linux, Node `20.19.6`, pinned `pnpm@9.15.4`.
- Chrome for Testing `147.0.7727.15`, 격리 임시 profile·HTTPS fixture·controlled Provider.
- 자격증명·실제 사이트 session·실제 Provider는 이 검증에 사용하지 않았다.

## 실행한 검사

| 검사                                    | 결과                        | 범위·한계                                                                                       |
| --------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                        | PASS                        | 공유 계약과 source/test TypeScript                                                              |
| `pnpm lint`                             | PASS                        | ESLint + 저장소 설정의 Prettier 범위                                                            |
| `pnpm check:module-boundaries`          | PASS                        | 312 source TypeScript 파일, import cycle 없음                                                   |
| `pnpm test:unit`                        | PASS: 159 files / 734 tests | 최종 코드의 전체 단위 회귀                                                                      |
| `pnpm test:fixture`                     | PASS: 1 test                | Vitest fixture; 실제 사이트 아님                                                                |
| `pnpm test:e2e`                         | PASS: 1 test                | 기존 Vitest smoke; 실제 Chrome 아래와 별개                                                      |
| 버전 유지 build·package validation      | PASS                        | `tsc -p tsconfig.build.json` + `build-extension.mjs` + `validate-package.mjs`                   |
| 기존 S17 + 지연 비용 화면 Chrome        | PASS: 9 cases               | 작업 중 build에서 실행; final build의 추가 확인은 아래 별도 기록                                |
| final build 지연 비용 화면 Chrome       | PASS                        | 최신 관찰 재판단·이동 1회·최종 completed·일반 오류 없음                                         |
| final build anchor ARIA menuitem Chrome | PASS                        | 실제 anchor menuitem을 navigate로 제안·승인·목적지 검증·최종 완료                               |
| `pnpm check:source-size`                | FAIL: 기존 초과 86 files    | 새 source 파일과 기존 199줄 이하 파일의 신규 초과는 없음; 기존 대형 모듈 분할은 이 수정 범위 밖 |
| `git diff --check`                      | PASS                        | 의도한 변경·기존 버전 변경 외 추가 생성 버전 없음                                               |

## 통제 Chrome 실행

기존 8개 S17 흐름과 `delayed-cost-screen`을 묶어 검증했다. final build에서는
`delayed-cost-screen`과 `anchor-menuitem`을 따로 확인한다. 아래 환경 변수는
Provider를 controlled fixture로 고정하고 기존 live 설정의 영향을 제거한다.

```bash
CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
  env -u S17_LIVE_MODEL -u ACCESSIBLE_ITEMS_CASES \
  node --experimental-websocket scripts/chrome-s17-plan-feedback-smoke.mjs

CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
  ACCESSIBLE_ITEMS_CASES=delayed-cost-screen,anchor-menuitem \
  env -u S17_LIVE_MODEL \
  node --experimental-websocket scripts/chrome-s17-plan-feedback-smoke.mjs
```

[재현 fixture](../../scripts/chrome-act-goal-reassessment-fixture.mjs)는 실제 hash 이동이
검증된 뒤 첫 goal Provider 응답이 진행 중일 때 Pricing dialog를 렌더링한다.
첫 `incomplete` 보고가 폐기되고 새 observation ID·화면이 제공되는지 확인한다.
두 번째 호출은 `report_goal_status`만 제공받아 목표를 완료로 보고한다.
수집 이벤트에서 VERIFIED action 1회, final completed 1회, reassessments 1회,
일반 오류 카드 없음, Panel idle, 복구 이력과 안전한 진단 ZIP을 검사했다.

`anchor-menuitem`은 HTTP(S) anchor에 ARIA menuitem role을 부여한 실제 DOM에서
navigate 도구·승인·scope 전환·fresh snapshot·최종 목표 확인을 검사한다.
기존 전체 흐름은 document-link, async-preview, search, multiple, deny, preview,
controls-link, states-link다. deny는 목표 완료 요구 대신 실제 거절 경계를 검사한다.

안전한 통계만 저장한 [JSON 요약](act-completion-after-navigation-2026-10-11.json)에
결과를 연결한다. 원본 Chrome 보고서·진단 ZIP·page/provider 원문은 저장소에 넣지 않는다.

## 보존한 경계와 남은 확인

- 실행 실패·미확인 결과는 모델의 완료 주장보다 먼저 보존한다. 후속 content 변경은
  VERIFIED action 이력을 변경하지 않으며 retry에 mutation·scroll·권한 확대가 없다.
- binding 변경, Stop, generation 변경과 restart 후 늦은 응답은 완료로 승격하지 않는다.
- UI/toast와 DOM 안정으로 authoritative 저장 결과를 대신하지 않는다. `render_result`
  generation verifier가 없는 경로는 실행 전 차단한다.
- scoped evidence가 완전하지 않거나 민감 컨트롤·크기 상한에 걸리면 전체 재관찰로
  되돌린다. 읽기용 reference 정규화는 승인·dispatch authority를 재사용하지 않는다.
- 실제 비용 사이트·live Provider의 원래 요청 재실행, 배포 및 수정 commit은 미확인이다.
  따라서 이슈 상태는 **검증 중**이며 실제 사용 범위의 해결을 선언하지 않는다.
