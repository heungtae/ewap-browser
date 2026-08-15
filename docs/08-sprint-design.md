# 08. Sprint 설계서

## 1. 목적과 운영 원칙

이 문서는 01~07 설계를 구현 가능한 작은 단위로 나눈다. 각 Sprint는 선행 Sprint의 검증된 산출물만 의존하며, 완료 전 다음 Sprint의 사용자 기능을 노출하지 않는다. 본 문서는 개발 계획이며 구현 완료를 뜻하지 않는다.

### 공통 완료 조건

각 Sprint는 다음을 모두 만족해야 `Completed`가 된다.

1. 해당 Sprint의 설계 범위와 계획 범위만 구현한다.
2. [10-sprint-verification-plan.md](10-sprint-verification-plan.md)의 필수 로컬 검증을 통과한다.
3. 결과, 실행 명령, 알려진 제한을 [11-sprint-progress.md](11-sprint-progress.md)에 기록한다.
4. 검증된 변경만 하나의 독립된 Git commit으로 만든다. 커밋 메시지는 `feat(sprint-N): ...`, 문서만 변경한 경우 `docs(sprint-N): ...` 형식을 사용한다.

검증 실패, 미확정 운영 입력, 보안 게이트 보류가 있으면 commit하지 않고 Sprint 상태를 `Blocked` 또는 `In progress`로 기록한다. 다음 Sprint를 시작하지 않는다.

## 2. Sprint 경계

| Sprint | 목표 | 포함 경계 | 명시적 제외 | 선행 조건 |
|---|---|---|---|---|
| S0 | 로컬 개발·시험 기반 | TypeScript MV3 골격, 컴파일/검사/Chrome 개발 실행, fixture test 골격 | 실제 AI Hub, SSO, 브라우저 변경 도구 | 없음 |
| S1 | semantic projection preview | Side Panel, service worker, content semantic projection snapshot, `ref_id`, document registration, preview policy | production Ask/Act, Profile resolver, Native Host, 외부 LLM 호출 | S0 |
| S2 | R1 변경의 결정적 제어 | origin/profile gate, policy/audit, text/select/checkbox preflight·verifier | production Ask/Act, R2, Native Host, MCP | S1 |
| S3 | R2 확인과 종료 상태 | intent digest, 단발 확인, click/key, Stop, `VERIFIED/FAILED/UNKNOWN` | production Ask/Act, SSO/AI Hub, production 배포 | S2 |
| S4 | 신뢰된 모델 경계 | Native Messaging host, bridge adapter, SSO broker adapter, failure normalization | 실제 운영 credential, broad tool 확장 | S3 및 운영 계약 입력 |
| S5 | Profile/MCP와 production Ask 활성화 | Page Profile, Business MCP, production Ask/Act gates, managed-policy/패키징/rollback, 파일럿 증적 | 전체 조직 배포 | S4 및 보안·운영 승인 |

## 3. Sprint별 설계 결정

### S0 — 로컬 개발·시험 기반

- `extension/`은 Manifest V3용 TypeScript 코드, `tests/`는 unit/fixture/E2E 분리, `scripts/`는 Windows 개발자 명령을 둔다.
- 개발 Chrome은 전용 임시 사용자 데이터 디렉터리와 `--load-extension`만 사용한다. 사용자의 기본 Chrome profile, 회사 관리 policy, production extension ID를 변경하지 않는다.
- Native Host 개발 등록은 production HKLM 설치와 구분된 개발 전용 manifest/extension ID를 사용한다. production 설치 경로나 AI Hub 비밀값을 요구하지 않는다.

### S1 — semantic projection preview

- Side Panel → service worker → content script의 typed runtime message와 content-owned `DOCUMENT_REGISTER`만 연다. service worker는 등록된 epoch만 run에 채택한다.
- snapshot은 실제 Chrome DOM에서 산출 가능한 redacted semantic role/name/state와 현재 document epoch의 `ref_id`만 반환한다. browser AX tree/node ID나 input value는 반환하지 않는다.
- preview는 page-read origin과 S0 manifest/policy 일치만 통과하면 현재 projection을 렌더링한다. Profile resolver, Native Host, LLM egress는 호출하지 않으며 성공 mock도 허용하지 않는다.
- production Ask와 Act는 S5 전까지 `PROFILE_UNAVAILABLE`로 fail closed 한다. preview는 읽기 도구 외 메시지와 mutation 요청을 service worker와 content script 양쪽에서 거부한다.

### S2 — R1 결정적 변경

- policy engine은 UI·모델과 무관한 순수 함수이며 origin, mode, profile, target, risk를 입력으로 받는다.
- R1 도구는 하나의 `ActionIntent`만 실행하고 실행 전 target 상태와 실행 후 기대 semantic projection state를 대조한다.
- 모델 proposal과 target preflight 뒤 `AWAITING_VALUE` 상태에서만 Side Panel protected value control을 연다. `set_text_by_ref`/`select_option_by_ref` 값은 run/target/tool 한정 one-time slot으로 `SUBMIT_ACTION_VALUE`에서 받고 content `EXECUTE_ACTION`에 한 번만 전달한다. terminal outcome/취소/navigation/5분 inactivity에는 폐기하며 값·slot ID·digest를 Host, bridge, LLM에 보내지 않는다.
- audit은 06의 allowlist JSON schema만 기록한다. raw text, field value, URL path, header는 기록하지 않는다.
- signed Profile과 S4 Host가 없는 동안 R1 executor는 local controlled fixture에서만 검증하며 production Act는 S5 전까지 활성화하지 않는다.

### S3 — R2 확인과 실패-폐쇄

- R2는 Host session-binding verifier가 제공한 opaque session binding, tab context, document epoch, intent digest에 결속된 일회성 confirmation으로만 실행한다. S3의 local test adapter는 cross-session rejection 계약만 증명하며, production R2는 S4 Host verifier와 S5 Profile 없이는 활성화하지 않는다.
- navigation, stale ref, Stop, worker 재시작은 진행 중 mutation을 취소하며 `UNKNOWN`을 자동 재시도하지 않는다.
- `click_by_ref`와 `press_key_by_ref`는 profile/tool별 verifier 기대값과 명시적인 programmatic activation capability 없이는 성공으로 처리하지 않는다. trusted input이 필요한 target 및 capability 밖 role/key는 `TARGET_NOT_ACTIONABLE`로 거부하며 pointer/debugger/coordinate 우회는 추가하지 않는다.

### S4 — Native Host·AI Hub 경계

- extension은 typed/redacted request와 cancellation만 Native Host에 보낸다. 모델용 snapshot/proposal에는 run 한정 `model_ref`만 허용하며 raw `ref_id`와 mapping은 contract 단계에서 거부한다.
- Host는 allowed extension ID, framing, header allowlist, named-pipe ACL/mutual request authentication/replay, assertion failure를 독립적으로 검사한다.
- 실제 broker URL, assertion contract, fixed header ownership이 제공되지 않으면 `AI_HUB_NOT_CONFIGURED`로 종료한다. placeholder 값으로 호출하지 않는다.

### S5 — Profile/MCP·운영 패키지

- Profile resolver는 origin/path와 [14의 `semantic-projection-fp-v1`](14-semantic-projection-fingerprint.md) value-free fingerprint만 받으며, signed profile의 ID/version/expiry/key rotation/durable replay 방지/크기 제한을 검증한다. profile은 synthetic click/key 가능 role·key와 trusted-input-required target의 deny capability, page별 Business MCP server/tool 확장을 선언해야 한다. SPA major semantic 변화 시 이전 tool을 철회하고 profile을 재해결한다.
- S5에서 S4 Host가 준비된 뒤 production Ask를 활성화한다. verified Profile은 Act와 Business MCP tool에 필수이고, 서명된 `UNKNOWN_PROFILE`은 Ask basic-read-only만 허용한다. 그 전 Sprint의 preview/local fixture는 production Ask/Act 성공 증적이 아니다.
- authoritative field는 [13](13-page-profile-and-business-mcp-contract.md)의 page profile deterministic Business MCP value source만 사용한다. Host는 profile-allowlisted server/tool Registry route와 별도 SSO assertion으로 호출하며 MCP 실패 시 다른 server/tool을 포함해 추측하거나 DOM 대체값을 사용하지 않는다. `agentic-read` tool은 해당 page profile에 allowlist된 read-only tool만 동적으로 모델에 노출한다.
- package, update manifest, managed policy, Native Host installer와 rollback은 동일 compatibility matrix와 hash 증적으로 묶는다.

## 4. Sprint 산출물 규칙

매 Sprint는 아래 세 문서의 같은 번호 섹션을 갱신한다.

- 이 문서: 설계 경계와 보안 결정
- [09-sprint-development-plan.md](09-sprint-development-plan.md): 작업 항목·파일·스크립트·완료 기준
- [10-sprint-verification-plan.md](10-sprint-verification-plan.md): 실행 가능한 로컬 검증과 보류가 가능한 수동 검토

[11-sprint-progress.md](11-sprint-progress.md)는 계획이 아니라 실제 상태의 단일 기준이다. 계획 문서의 체크박스만으로 완료를 선언할 수 없다.
