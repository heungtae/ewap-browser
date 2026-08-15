# S4 — Native Host·AI Hub 경계

## 1. 목표와 종료 시 보이는 결과

Chrome extension 밖의 신뢰 경계를 persistent Native Messaging Host, ACL named pipe bridge와 Windows SSO adapter로 구현할 수 있게 닫는다. 종료 시 mock integration에서 multi-request stream, R2 binding, cancellation과 failure normalization을 검증하고, 운영 입력이 없으면 네트워크 호출 없이 `AI_HUB_NOT_CONFIGURED`로 끝나야 한다.

## 2. 착수 조건과 입력

- S3가 증거와 commit hash를 가진 `Completed`다.
- production extension ID 소유자와 Host allowed-origin 정책 owner가 정해졌다.
- broker URL/assertion audience, bridge ownership, fixed header ownership, timeout·size·concurrency 값의 운영 계약이 제공됐거나 미제공 상태의 fail-closed 동작을 승인했다.

실제 운영 입력이 없으면 mock/no-config 범위는 진행할 수 있지만 live integration과 production 활성화는 `Blocked`다. placeholder endpoint나 assertion으로 성공을 만들지 않는다.

## 3. 포함 범위

- `connectNative()` persistent-port multi-frame loop
- request/stream correlation, cancellation, concurrency, disconnect/process-crash cleanup
- typed/redacted extension→Host request와 domain error normalization
- run 한정 `model_ref`만 허용하는 model snapshot/proposal schema
- three-step R2 binding IPC의 trusted Host implementation boundary
- Windows ACL named-pipe bridge, mutual request authentication과 nonce replay 방지
- SSO broker adapter, administrator-owned config reader와 no-config adapter
- stdout framing 분리와 redacted diagnostics/Event Log policy

## 4. 명시적 제외와 feature gate

- extension request가 고르는 arbitrary URL, model, shell command, header map
- TCP loopback bridge, Authorization/cookie forwarding, extension-readable static secret
- 실제 credential/assertion의 repository·fixture 저장
- verified Profile 없이 production Ask/Act 활성화
- 운영 계약 미제공 환경의 live endpoint 호출 또는 mock success

## 5. 핵심 설계 계약

1. persistent port는 여러 frame을 읽고 request/stream ID를 correlation한다. disconnect와 process crash는 pending request, confirmation state와 retained resources를 폐기한다.
2. Host는 allowed extension ID, message size/schema, request ID uniqueness와 raw `ref_id`/mapping 부재를 독립적으로 검증한다.
3. extension은 model용 `model_ref`만 보낸다. Host·bridge·LLM에는 raw DOM/ref mapping/value/profile body가 들어가지 않는다.
4. bridge route, model, fixed header와 endpoint는 administrator ACL 구성만 소유하며 extension이나 Managed Storage가 덮어쓸 수 없다.
5. SSO assertion은 짧은 수명과 올바른 audience를 가지며 사용자 이름·UPN·group과 assertion body를 extension에 반환하지 않는다.
6. named pipe는 OS ACL과 mutual request signing/nonce cache를 모두 통과해야 한다. 직접 TCP나 replay 요청은 거부한다.
7. timeout, cancellation, malformed response, broker/config failure는 closed domain error로 정규화하고 mutation을 성공 처리하지 않는다.

## 6. 작업 패키지

| 카드 | 결과 | 대표 negative case |
|---|---|---|
| S4-1 | persistent framed loop, correlation, model/R2 schema | malformed/oversize/duplicate/raw-ref/foreign origin/disconnect leak |
| S4-2 | administrator config와 no-config adapter | missing input의 network call 또는 mock success |
| S4-3 | ACL named-pipe mutual auth와 nonce cache | direct TCP, bad ACL/signature, replay |
| S4-4 | SSO/session binding/durable store interface | identity/assertion/high-water 값의 extension 노출 |

상세 파일 경계는 [12의 S4 카드](../12-low-cost-agent-implementation-spec.md#s4-카드)를 따른다.

## 7. 검증과 종료 증거

- contract test에서 framing, ID correlation, schema/size/origin/header allowlist, cancellation과 error mapping을 검사한다.
- 한 persistent port에서 multi-request confirmation/stream, timeout, disconnect와 process crash cleanup을 재현한다.
- mock broker와 named-pipe bridge로 assertion/session-binding success와 failure, ACL/signature/nonce replay를 검사한다.
- 운영 입력 미제공 환경에서 outbound network 없이 `AI_HUB_NOT_CONFIGURED`를 증명한다.

정확한 검증 항목은 [10의 S4 검증](../10-sprint-verification-plan.md#6-s4-검증)을 따른다.

## 8. 종료와 S5 인계

S4는 mock/no-config 증거와 live 운영 검증의 상태를 분리해 기록하고 독립 commit hash가 있을 때만 개발 Sprint로 `Completed`다. live 계약 검증이 남으면 production release blocker로 명시한다. S5에는 trusted Host request boundary, R2 binding, separate assertion audience, durable store interface와 normalized failure contract를 넘긴다.

## 9. 설계 추적

- 신뢰 경계와 model_ref: [01](../01-architecture.md)
- Host/bridge/SSO 계약: [04](../04-llm-and-sso-integration.md)
- 구성 소유권·설치: [05](../05-deployment-operations.md)
- data/audit boundary: [06](../06-data-audit-and-privacy.md)
- 개발 계획: [09의 S4](../09-sprint-development-plan.md#6-s4--native-hostbridgesso-adapter)
