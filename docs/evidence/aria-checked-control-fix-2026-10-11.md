# ARIA checked 컨트롤 수정 검증 — 2026-10-11

관련: [ISS-20261011-002](../issues/records/2026-10-11-aria-radio-button-execution.md),
[ISS-20261011-003](../issues/records/2026-10-11-web-control-capability-parity.md).
HEAD `549ebacc76b5608d80ca70ab71610da11bbc29f0` + 미커밋 작업 트리,
ContextPilot `0.1.100`, Chrome `147.0.7727.15`.

## 변경과 검증 범위

[checked-control.ts](../../extension/src/content/checked-control.ts)가 native input
checkbox/radio와 button 기반 ARIA checkbox/radio의 boolean 상태를 읽는다.
Content snapshot, semantic 검증, 실행이 같은 reader를 사용한다. mixed·잘못된 값은
false로 바꾸지 않으며, boolean checked 상태가 없는 대상은 generic/declared 도구 enum에서 제외한다.
`:disabled`와 조상 `aria-disabled=true`는 후보와 실행에서 차단한다.

요청 상태와 같으면 클릭 없이 만족된 상태로 반환한다. radio false 요청은 현재 false인
경우에만 no-op이며, 선택된 radio를 클릭해서 해제하려 하지 않는다. 실제 클릭은 한 번만
수행하고 50ms 간격으로 최대 1500ms 상태를 확인한다. document/scope/ref/role/name이
바뀌거나 대상이 교체되면 `TARGET_STALE`로 끝낸다. replacement에 실행 권한을 옮기지
않으며, 교체된 대상의 읽기 재식별과 전체 LLM 판단 확장은 S21에 남긴다.

[Chrome JSON](aria-checked-control-fix-2026-10-11.json)에 34개 관찰과 source/artifact
SHA-256을 보존했다. 이 숫자는 수정 성공 사례와 아직 남은 호환성 결함의 재현 관찰을
함께 센 것이다. 모든 웹 요소의 지원 또는 ISS-20261011-003 해결을 의미하지 않는다.

- ARIA radio(tabindex=-1, 100ms 지연 반영)·checkbox: 상태 읽기와 실제 한 번 클릭 후 검증 PASS.
- native checkbox 선택·이미 선택된 상태, ARIA no-op: PASS.
- ARIA disabled·mixed·선택된 radio false: 실행 거절 및 추가 클릭 없음 PASS.
- 클릭 중 DOM replacement: TARGET_STALE 및 클릭 1회 PASS.
- disabled fieldset 자식: 도구 후보 제외 PASS.

Chrome checked 검사는 통제 HTTPS 페이지의 실제 Worker → Content 내부 경로 및
compiled provider schema를 사용했다. 사용자 승인·실제 Provider·원래 사이트의 전체
흐름 검증은 아니다. readonly/type/editor/multiple-select 등 ISS-20261011-003의 남은
불일치는 별도 backlog다. 원본 진단과 과거 실패 audit JSON은 보존한다.

## 수행한 검사

- `pnpm typecheck`, `pnpm lint`, `pnpm check:module-boundaries`: PASS.
- `pnpm test:unit`: 160 files / 741 tests PASS, 기존 navigation/goal/request 회귀 포함.
- `pnpm test:fixture`, `pnpm test:e2e`: 각각 1 test PASS.
- 버전 변경 없는 TypeScript compile → extension build → package validation: PASS.
- 통제 Provider + 실제 Side Panel 승인 경로: anchor menuitem 및 delayed cost screen 2 cases PASS.
- 통제 Chrome 웹 요소 검사: 34 observations PASS(지원·남은 결함 재현 범위는 위 설명 참조).

재현 명령:

```bash
CHROME_FOR_TESTING_BIN=<chrome> WEB_ELEMENT_AUDIT_REPORT=<report.json> \
  node --experimental-websocket scripts/chrome-web-element-audit.mjs
```

새 단위 회귀는 checked reader/실행에 대한 6개와 도구 후보 상태 필터 1개다.
제품 버전은 0.1.100을 유지했다. commit·배포 및 원래 사이트 검증은 수행하지 않았다.

화면 이동 회귀는 `scripts/chrome-s17-plan-feedback-smoke.mjs` wrapper에
`ACCESSIBLE_ITEMS_CASES=anchor-menuitem,delayed-cost-screen`을 지정해 실행했다.
처음 직접 실행한 명령은 S15_SUITE 설정이 빠져 이벤트 수집 없이 테스트 assertion이
실패했다. 제품 실패로 판정하지 않았으며 정상 wrapper로 재실행한 두 사례가 통과했다.
