# 09. Sprint 개발 계획서

## 1. 공통 개발 규칙

- 구현 카드의 파일 경계·DTO·알고리즘·테스트는 [12-low-cost-agent-implementation-spec.md](12-low-cost-agent-implementation-spec.md)를 따른다. 저가형 AI에는 Sprint 전체가 아니라 카드 하나만 전달한다.
- 각 Sprint 시작 시 [11-sprint-progress.md](11-sprint-progress.md)의 상태를 `In progress`로 바꾸고 범위를 기록한다.
- 새 의존성, manifest permission, runtime message, Company Tool은 해당 Sprint의 설계·검증 항목과 함께만 추가한다.
- 실제 운영 endpoint, SSO assertion, API key, production policy는 repository·fixture·개발 스크립트에 넣지 않는다.
- Sprint 종료는 검증 계획의 필수 명령 성공, progress 증적 기록, 범위 확인 후의 단일 Git commit이다. Git commit 전에는 다음 Sprint 코드를 섞지 않는다.

## 2. S0 — 로컬 개발·시험 기반

### 작업 범위

1. `extension/`, `native-host/`, `contracts/`, `tests/`, `scripts/`의 신규 코드베이스 골격과 TypeScript build configuration을 만든다.
2. MV3 최소 manifest와 비어 있는 Side Panel/service worker/content script를 만든다. 필요한 최소 permission만 선언하고 `<all_urls>`는 넣지 않는다.
3. unit test runner, fixture page server, Chrome E2E runner와 CI와 동일한 `npm` 명령을 정의한다.
4. 아래 로컬 스크립트를 구현한다. 각 스크립트는 실패 시 비영 상태를 반환하고, 비밀값을 출력하지 않는다.

| 계획 경로 | 책임 | 동작 |
|---|---|---|
| `scripts/bootstrap-local.ps1` | 개발 환경 | Node/package manager/Chrome과 의존성 lock 일치를 검사하고 개발 의존성을 설치한다. |
| `scripts/build-extension.ps1` | 컴파일 | `npm run typecheck`, `npm run build`를 실행하고 unpacked extension 산출물 경로를 출력한다. |
| `scripts/test-local.ps1` | 자동 검증 | lint, unit, fixture, E2E 명령을 순서대로 실행한다. |
| `scripts/run-chrome-dev.ps1` | Chrome 개발 설치 | 전용 임시 profile로 Chrome을 시작하고 build output을 `--disable-extensions-except`/`--load-extension`으로 로드한다. 기본 profile에는 설치하지 않는다. |
| `scripts/install-native-host-dev.ps1` | Native Host 개발 연결 | 개발 전용 host manifest와 개발 extension ID를 현재 사용자 개발 영역에 등록한다. production HKLM 설치를 대체하지 않는다. |
| `scripts/uninstall-native-host-dev.ps1` | 개발 정리 | 위 개발 등록만 제거하고 production host/policy에는 접근하지 않는다. |

### 완료 기준과 commit

- 깨끗한 checkout에서 bootstrap, compile, lint, unit fixture, unpacked extension Chrome 실행이 가능하다.
- script help/usage와 개발용 Chrome profile 위치가 문서화된다.
- S0의 검증 증적을 progress에 기록한 뒤 `feat(sprint-0): add local extension development harness`로 commit한다.

## 3. S1 — semantic projection preview

1. typed runtime contracts와 sender/tab/frame/run validation을 만든다.
2. Side Panel의 preview 요청/상태 UI, service worker coordinator, 실제 Chrome DOM semantic projection collector/ref registry를 잇고 content-owned `DOCUMENT_REGISTER`/worker-restart 재등록을 구현한다.
3. `read_semantic_projection`, `find_by_ref`, `read_page_summary`의 preview projection만 추가한다. 모델/Host용 tool exposure는 추가하지 않는다.
4. redaction, document epoch 폐기·registration, 메시지 allowlist, page-read gate와 preview mutation 거부를 구현한다. resolver/LLM egress는 S5에서만 호출한다.

완료 후 S1 검증 증적을 기록하고 `feat(sprint-1): add semantic projection preview`로 commit한다.

## 4. S2 — R1 정책·감사·변경

1. Managed Storage schema parser, exact origin matcher, mode/profile/risk policy engine을 구현한다.
2. `set_text_by_ref`, `select_option_by_ref`, `set_checked_by_ref`의 schema, preflight, deterministic executor, verifier를 만든다. text/option에는 target 확정 뒤 `AWAITING_VALUE`, Side Panel `SUBMIT_ACTION_VALUE`, run/target/tool 한정 slot/digest, content one-time delivery와 retained-reference 폐기를 구현한다.
3. policy decision과 terminal outcome의 최소 audit serializer를 추가한다.
4. controlled fixtures에 정상·stale·occluded·sensitive-field와 terminal outcome/취소 시 value slot 및 retained-reference 폐기 사례를 추가한다. JavaScript string의 물리적 overwrite를 성공 기준으로 주장하지 않는다.

S2 산출물은 controlled fixture에서만 R1을 실행한다. S5의 verified Profile과 S4 Host 전에는 production Act를 활성화하거나 success mock으로 대체하지 않는다.

완료 후 S2 검증 증적을 기록하고 `feat(sprint-2): add verified r1 actions`로 commit한다.

## 5. S3 — R2 확인·중단·상태

1. intent digest, `BIND_SESSION`/`ISSUE_CONFIRMATION`/`VERIFY_CONFIRMATION` Host session-binding interface, opaque tab context, confirmation store, one-time confirmation UI와 expiry/invalidation을 구현한다. local test adapter만으로는 production R2를 활성화하지 않는다.
2. Profile의 programmatic activation capability 안에서만 `click_by_ref`, `press_key_by_ref`, Stop/cancellation, navigation/worker-restart recovery를 구현한다. trusted-input-required fixture는 `TARGET_NOT_ACTIONABLE`로 끝낸다.
3. `VERIFIED`, `FAILED`, `UNKNOWN`, `CANCELLED` 결과를 단일 terminal-state contract로 정규화한다. S3 local adapter/fixture는 production Ask/Act 성공으로 취급하지 않는다.
4. 모든 `UNKNOWN`/단절 경로에서 재시도를 금지한다.

완료 후 S3 검증 증적을 기록하고 `feat(sprint-3): add r2 confirmation and terminal states`로 commit한다.

## 6. S4 — Native Host·bridge·SSO adapter

1. Native Messaging framing, allowed extension ID, `model_ref`만 포함한 typed request/proposal, R2 binding IPC schema, cancellation을 구현한다. raw `ref_id`와 ref mapping은 extension/Host contract에서 거부한다.
2. Windows ACL named-pipe bridge adapter, mutual request signing/nonce replay 방지, fixed-header allowlist/error normalization을 구현한다. TCP loopback bridge를 만들지 않는다.
3. SSO broker adapter와 session-binding verifier interface, mock broker를 구현한다. 운영 계약이 없으면 network 호출 대신 `AI_HUB_NOT_CONFIGURED`를 반환한다.
4. Host diagnostics의 stdout framing 분리와 redacted Event Log/stderr 정책을 구현한다.

완료 후 S4 검증 증적을 기록하고 `feat(sprint-4): add native host and ai hub boundary`로 commit한다.

## 7. S5 — Profile/MCP·배포·파일럿 준비

1. [13의 resolver/JWS schema](13-page-profile-and-business-mcp-contract.md)를 따른 signed Profile resolver, [14의 `semantic-projection-fp-v1`](14-semantic-projection-fingerprint.md) canonicalization과 golden vectors, key-ring verification/rotation, Host durable high-water compare-and-set, cache fallback/invalidation, page profile Business MCP extension, tool withdrawal을 구현한다. Business MCP adapter는 current profile의 server/tool MCP Registry route·별도 assertion·deterministic binding·agentic-read dynamic exposure·value visibility·late-response 폐기 규칙을 포함한다.
2. extension package, update manifest, managed policy sample validator, Native Host installer/health-check/rollback script를 만든다.
3. compatibility matrix, package/policy/host hash capture, portal-install VM checklist를 자동화 가능한 범위까지 구현한다.
4. verified Profile + Host 뒤 production Ask/Act gate를 활성화하고, 07의 release checklist에 필요한 승인 증적 위치와 파일럿 운영 runbook을 연결한다.

완료 후 S5 검증 증적을 기록하고 `feat(sprint-5): prepare managed pilot release`로 commit한다.
