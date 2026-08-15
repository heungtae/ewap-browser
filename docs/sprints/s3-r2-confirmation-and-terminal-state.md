# S3 — R2 확인·중단·종료 상태

## 1. 목표와 종료 시 보이는 결과

업무 상태 변경 가능성이 있는 모든 mutation primitive를 정확한 intent에 결속된 일회성 확인으로 승격하고, Stop·navigation·단절·검증 불확실성을 하나의 fail-closed terminal-state 계약으로 닫는다. 종료 시 local session-binding adapter로 흐름을 검증하지만 production R2는 열지 않는다.

## 2. 착수 조건과 입력

- S2가 증거와 commit hash를 가진 `Completed`다.
- `ActionIntent`, value binding, effect-aware policy와 verifier builder가 안정된 계약이다.
- Host가 나중에 구현할 `BIND_SESSION`, `ISSUE_CONFIRMATION`, `VERIFY_CONFIRMATION` interface schema를 검토했다.

## 3. 포함 범위

- canonical intent digest와 opaque tab context
- session-binding verifier interface와 production 활성화가 불가능한 local test adapter
- one-time confirmation store, expiry, reject, atomic consume와 invalidation
- 모든 mutation primitive의 R2 confirmation/verifier pipeline
- capability 안의 `click_by_ref`, `press_key_by_ref`
- Stop, navigation, profile/document/worker 변화의 cancellation
- `VERIFIED`, `FAILED`, `UNKNOWN`, `CANCELLED` terminal-state normalization

## 4. 명시적 제외와 feature gate

- 실제 Windows 사용자/session 검증과 production R2 활성화
- trusted input 합성, pointer/debugger/coordinate 우회
- R3 행동, verifier 없는 autosave/server-side effect
- `UNKNOWN` 또는 disconnect 뒤 자동·모델 유도 재시도
- AI Hub, resolver, Business MCP production 호출

local adapter는 cross-context rejection 계약만 증명한다. S4 Host verifier와 S5 verified Profile 없이는 confirmation UI 성공도 production Act 증거가 아니다.

## 5. 핵심 설계 계약

1. R2 token은 Host가 검증할 session binding, opaque tab context, document epoch와 exact intent digest에 결속되고 한 번만 사용한다.
2. 확인 화면은 target label, action, risk reason, profile name을 표시하되 raw value와 digest를 표시하지 않는다.
3. primitive와 risk pipeline은 분리한다. text/select/checkbox도 autosave·external effect이면 R2와 authoritative business transition을 요구한다.
4. Profile에 synthetic activation capability가 없는 role/key, trusted input이 필요한 target, closed verifier가 없는 effect는 `TARGET_NOT_ACTIONABLE`이다.
5. mutation 성공은 false→true state transition 또는 exact approved path-template와 post-state를 함께 증명해야 한다.
6. Stop·navigation·worker restart·content disconnect는 pending confirmation/value/model/native resource를 취소하고 복구하지 않는다.
7. `UNKNOWN`은 감사와 사용자 통지만 하고 retry queue를 만들지 않는다.

## 6. 작업 패키지

| 카드 | 결과 | 대표 negative case |
|---|---|---|
| S3-1 | digest, tab context, confirmation state machine | duplicate/expired/cross-tab/cross-epoch token |
| S3-2 | three-step binding interface와 local fake | nonce/session/digest mismatch, fake production enable |
| S3-3 | all-primitive R2 pipeline과 cancellation | no confirmation, undeclared autosave, trusted-input target, R3, retry |
| S3-4 | confirmation/terminal Side Panel renderer | raw value/digest UI leak |

상세 파일 경계는 [12의 S3 카드](../12-low-cost-agent-implementation-spec.md#s3-카드)를 따른다.

## 7. 검증과 종료 증거

- unit에서 digest fields, session/tab/document binding, token lifecycle, terminal transition과 retry prohibition을 검사한다.
- Chrome fixture에서 click/key와 autosave primitive의 R2 확인, exact navigation/post-state, Stop/navigation/content disconnect를 검사한다.
- cross-session/tab/epoch, confirmation reuse, no-verifier effect, unsupported activation, same-origin-only navigation과 R3를 거부한다.
- `FAILED`, `UNKNOWN`, `CANCELLED` 각각에서 pending value/confirmation/resource가 남지 않음을 검사한다.

정확한 검증 항목은 [10의 S3 검증](../10-sprint-verification-plan.md#5-s3-검증)을 따른다.

## 8. 종료와 S4 인계

S3은 local adapter라는 제한을 명시한 증거와 독립 commit hash가 상태 원장에 기록될 때만 `Completed`다. S4에는 frozen R2 binding IPC, cancellation correlation과 terminal cleanup contract를 넘긴다. production R2 gate는 계속 닫아 둔다.

## 9. 설계 추적

- run state와 Act flow: [01](../01-architecture.md)
- confirmation·Stop·risk policy: [02](../02-security-policy.md)
- Host binding 요구: [04](../04-llm-and-sso-integration.md)
- 보안 회귀: [07](../07-verification-and-release.md)
- 개발 계획: [09의 S3](../09-sprint-development-plan.md#5-s3--r2-확인중단상태)
