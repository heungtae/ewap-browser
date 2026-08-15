# S2 — 결정적 Mutation 기반

## 1. 목표와 종료 시 보이는 결과

비신뢰 모델 제안과 실제 DOM mutation 사이에 결정적 policy, preflight, verifier, value binding, audit 경계를 만든다. 종료 시 controlled fixture에서 text/select/checkbox primitive의 R1 경로를 검증할 수 있어야 하지만 production Act는 열지 않는다.

## 2. 착수 조건과 입력

- S1이 증거와 commit hash를 가진 `Completed`다.
- S1의 document identity, projection/ref registry, origin gate가 변경 없이 재사용 가능하다.
- fixture용 signed Profile stub은 effect/verifier 계약만 제공하며 production trust를 가장하지 않는다.

## 3. 포함 범위

- UI·모델과 독립된 pure policy engine과 Company Tool registry
- `ActionIntent`, model proposal, value slot/digest의 closed schema
- text/select/checkbox preflight와 single-action primitive executor
- signed Profile declaration, pre-state와 tool rule에서 만드는 service-worker-owned verifier
- `AWAITING_VALUE`, Side Panel `SUBMIT_ACTION_VALUE`, one-time content delivery
- terminal/cancel/navigation/inactivity 시 value slot과 retained reference 폐기
- allowlist JSON audit serializer와 duplicate intent reservation

## 4. 명시적 제외와 feature gate

- production Act와 운영 Page Profile trust
- R2 confirmation, `click_by_ref`, `press_key_by_ref`, real Host/session binding
- value, slot ID 또는 digest의 모델·Host·bridge·persistent storage 전달
- 모델이 선택하는 verifier/`expected`/risk와 automatic retry

S2 executor는 development controlled fixture에서만 활성화한다. production policy에서는 S4 Host와 S5 verified Profile이 준비될 때까지 mutation을 차단한다.

## 5. 핵심 설계 계약

1. policy 결과는 origin, mode, profile, target, effect/risk에 대한 `ALLOW`, `REQUIRE_CONFIRMATION`, `DENY`다. 모델은 위험도나 verifier를 낮출 수 없다.
2. 모든 mutation primitive는 Profile effect에 따라 R2로 승격될 수 있다. S2는 local-ui-only로 증명된 R1 fixture만 실행한다.
3. verifier predicate는 signed Profile의 closed declaration, 실행 직전 pre-state와 deterministic tool rule로만 만든다. 이미 참인 predicate와 no-op은 성공이 아니다.
4. text/select 값은 target preflight 뒤 사용자가 Side Panel에서 입력한다. raw value는 intent, digest, audit, model, Host에 들어가지 않는다.
5. value slot은 run/tab/frame/document/profile/tool/ref/kind/TTL에 결속해 atomic consume하며 disconnect 뒤 재전송하지 않는다.
6. audit은 event schema allowlist만 serialize하고 raw value/digest/path/name/ref/header를 거부한다.

## 6. 작업 패키지

| 카드 | 결과 | 대표 negative case |
|---|---|---|
| S2-1 | policy/tool/proposal/intent/value schema | Ask mutation, raw value argument, unknown profile, R3 |
| S2-2 | preflight, primitive executor, verifier builder | model verifier, no-op, stale/occluded/disabled/sensitive target |
| S2-3 | Side Panel value slot과 one-time delivery | wrong binding, duplicate/expired, terminal 뒤 사용, send-failure retry |
| S2-4 | audit allowlist serializer | raw value/digest/path/name/ref leak |

상세 파일 경계는 [12의 S2 카드](../12-low-cost-agent-implementation-spec.md#s2-카드)를 따른다.

## 7. 검증과 종료 증거

- pure unit에서 exact origin, effect 기반 risk, schema, verifier ownership, slot TTL/atomic consume, audit redaction을 검사한다.
- Chrome fixture에서 `AWAITING_VALUE → SUBMIT_ACTION_VALUE → EXECUTE_ACTION → terminal` 흐름과 state transition verifier를 검사한다.
- wrong sender/run/tab/frame/epoch/profile/ref/tool/kind/slot, stale target, no-op, value leak와 IPC failure retry를 모두 거부한다.
- test log와 audit fixture 자체에도 raw value가 없음을 확인한다.

정확한 검증 항목은 [10의 S2 검증](../10-sprint-verification-plan.md#4-s2-검증)을 따른다.

## 8. 종료와 S3 인계

S2는 controlled fixture 증거와 독립 commit hash가 상태 원장에 기록될 때만 `Completed`다. S3에는 effect-aware policy, `ActionIntent` digest 입력, verifier builder, one-time value lifecycle과 audit serializer를 넘긴다. 이 인계는 production Act 승인이 아니다.

## 9. 설계 추적

- Act 실행 흐름: [01](../01-architecture.md)
- risk/tool/value/verifier 정책: [02](../02-security-policy.md)
- runtime message와 failure: [03](../03-extension-design.md)
- audit schema: [06](../06-data-audit-and-privacy.md)
- 개발 계획: [09의 S2](../09-sprint-development-plan.md#4-s2--r1-정책감사변경)
