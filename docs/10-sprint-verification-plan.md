# 10. Sprint 검증 계획서

## 1. 공통 실행 규칙

검증자는 먼저 [08-sprint-design.md](08-sprint-design.md)의 공통 종료 조건과 [`sprints/`](sprints/README.md)의 해당 독립 설계에서 명시적 제외·feature gate·인계 조건을 확인한다. 자동 테스트 성공만으로 제외된 production 기능을 활성화할 수 없다.

검증은 개발자 로컬 환경에서 재현 가능해야 한다. 명령 이름은 S0에서 확정하고 이후 Sprint는 동일 명령을 확장한다. 각 Sprint 완료 시 실행한 정확한 명령, 결과 요약, test count, commit hash를 [11-sprint-progress.md](11-sprint-progress.md)에 남긴다. 계획된 명령을 아직 실행하지 않은 상태를 성공으로 표기하지 않는다.

구현 범위가 12의 작업 카드보다 넓어지거나 카드에 없는 permission/message/tool/dependency가 생기면 검증을 시작하지 않고 먼저 설계 변경으로 되돌린다.

Windows 대상의 Chrome 개발 실행은 `scripts/run-chrome-dev.ps1`을 사용한다. 이 명령은 전용 profile에서 unpacked build를 로드하는 개발 테스트일 뿐, enterprise force-install 또는 production 설치 검증이 아니다.

| 공통 명령 | 최소 목적 |
|---|---|
| `./scripts/bootstrap-local.ps1` | 도구 버전·lockfile·Chrome 가용성 확인 |
| `./scripts/build-extension.ps1` | typecheck와 extension compile |
| `./scripts/test-local.ps1` | lint, unit, fixture, E2E 일괄 실행 |
| `./scripts/run-chrome-dev.ps1` | 전용 profile에서 unpacked extension 로드 |

## 2. S0 검증

| 구분 | 필수 확인 |
|---|---|
| Compile | `build-extension`이 typecheck/build를 통과하고 manifest와 Side Panel 산출물을 만든다. |
| Permission/policy contract | manifest `host_permissions` snapshot과 development/production policy bundle의 `permission_origins`가 정확히 일치하며, policy가 permission 밖 origin을 추가하려 하면 fail closed 한다. |
| Script safety | Chrome launcher가 기본 user-data-dir를 사용하지 않으며, native-host install/uninstall이 개발 전용 대상만 변경한다. |
| Chrome smoke | 개발 Chrome에서 Side Panel이 열리고 service worker/content script가 시작된다. |
| Regression | `test-local`이 skeleton unit/fixture/E2E를 실행하며 실패를 전파한다. |

## 3. S1 검증

- unit: content-owned document registration/epoch, redaction, runtime message schema, authoritative sender documentId/lifecycle validation, storage bootstrap gate, page-read origin gate, preview mutation deny.
- fixture/E2E: Chrome 106+ 실제 semantic projection과 `ref_id` 탐색, document-start registration, navigation 후 stale ref 폐기, forged tab/frame 및 old/prerender/frozen document 거부, worker restart 뒤 competing registration과 registration 전 run 거부, managed/local/session `TRUSTED_CONTEXTS` 및 content storage 접근 실패, Side Panel preview rendering.
- security negative: storage access-level 설정 실패, blocked origin/localhost/IP/file URL에서 preview snapshot, page `postMessage`, unknown runtime `kind`, registration 전 start, raw input value가 포함된 snapshot을 모두 거부한다. Host/LLM/resolver 호출 또는 mock 성공은 존재하지 않음을 검사한다.

## 4. S2 검증

- unit: exact origin matching, unknown profile deny, effect 기반 R1/R2 policy, Profile/pre-state/tool-rule verifier builder, model verifier field reject, sensitive-field deny, value slot/digest canonicalization·TTL·atomic consume·sender/binding validation, audit allowlist serializer.
- fixture/E2E: model proposal 뒤 `AWAITING_VALUE` 표시, text/option `SUBMIT_ACTION_VALUE → EXECUTE_ACTION` one-time delivery, checkbox, post-action semantic projection verifier와 terminal retained-reference 폐기를 각각 검사한다.
- security negative: Ask mutation, blocked origin, proposal의 `expected`/verifier/risk field, 이미 참인 predicate와 no-op, proposal 전 value submit, wrong sender/run/tab/frame/epoch/profile/ref/tool/kind/slot, duplicate/expired slot, stale/occluded target, raw value가 `START_ACT`·model tool/Host/bridge/audit/storage/error에 유입, raw value·digest·URL path의 audit/Host/LLM leak, IPC send 실패 뒤 value 재전송이 모두 실패한다.

## 5. S3 검증

- unit: digest 대상 fields, value origin/lifetime, session-binding/tab-context/document binding, one-time token, approval reject/expiry, terminal state transition, retry prohibition.
- fixture/E2E: R2 click/key와 text/select/checkbox autosave의 confirmation, authoritative business transition, cross-session/cross-tab/cross-epoch confirmation rejection, navigation 중 확인 무효화, exact approved path-template+post-state 검증, Stop, content disconnect, verifier failed/unknown과 trusted-input-required target 거부를 검사한다.
- security negative: R2 no-confirmation, session-binding/nonce/digest mismatch, effect declaration 또는 authoritative verifier 없는 autosave, capability 없는 synthetic activation, 단순 same-origin navigation, R3 request, `UNKNOWN` 재시도, worker restart 뒤 mutation 복구가 모두 거부된다.

## 6. S4 검증

- unit/contract: persistent Native Messaging framed loop, request/stream correlation, allowed extension ID, model snapshot/proposal의 `model_ref` allowlist와 raw-ref/mapping reject, malformed/duplicate request ID, `BIND_SESSION`/`ISSUE_CONFIRMATION`/`VERIFY_CONFIRMATION` schema, cancellation, header allowlist, error mapping.
- local integration: 한 `connectNative()` port의 multi-request confirmation/stream, mock SSO broker와 ACL named-pipe mock bridge로 assertion/session-binding success/failure, timeout, cancellation, disconnect/process crash cleanup, response-size·동시성 제한을 재현한다.
- security negative: 직접 bridge 호출, non-ACL process, header/assertion 위조, nonce replay, R2 cross-tab/cross-epoch/cross-session/confirmation reuse, 임의 extension origin, arbitrary URL/shell command, Authorization/cookie forwarding, stdout diagnostic leakage를 거부한다.
- 운영 입력 미제공 환경: 실제 endpoint 호출 없이 `AI_HUB_NOT_CONFIGURED`를 확인한다.

## 7. S5 검증

- unit/contract: invalid signature/key ID/size, resolver request의 path/query/header data minimization, request nonce/exact page-context JWS 결속, [14의 `semantic-projection-fp-v1`](14-semantic-projection-fingerprint.md) 665-byte golden JSON/hash, key insertion order 독립성, label alias와 `other`/`none`, state capability, relation ordinal, 포함 node의 현재 field/UI state와 forbidden-field 비영향, visibility toggle golden pair/tool revocation 및 canonicalization mismatch, same page/different record의 같은 fingerprint와 exact-context isolation, expiry/future-issued profile, signed definition projection 양쪽 계산, higher-version advance·same-version/same-definition-digest idempotent accept·same-version/different-definition-digest/lower-version reject, 같은 definition/version의 record별 binding 허용, valid cache fallback과 cache invalidation, durable store corruption, SPA path/visibility/major semantic 변화의 profile re-resolution/tool revocation, unknown page Ask basic-read-only/Act deny, activation capability/trusted-input deny, profile 밖 field·server/tool·arbitrary MCP route/header·AI Hub assertion reuse 거부, authoritative/agentic 두 call kind의 valid/invalid wire fixture·argument 전달·result-key/value-kind/nested/raw result reject, deterministic binding과 agentic-read exposure isolation, MCP visibility/audit leakage, cross-record JWS/subject/cache/late-response 거부, timeout/late response 및 MCP failure fail-closed, managed policy schema/version/header-key failure.
- packaging: manifest permission snapshot, package hash, host hash, policy hash, signed update manifest 형식과 compatibility matrix를 검사한다.
- clean Windows VM/manual: managed policy install, host registry/ACL, installer health check, rollback/policy disable, Side Panel status code를 확인한다.
- release gate: 07의 모든 자동 항목 성공 및 Security/IAM/AI Hub/Endpoint/Data owner의 별도 승인 증적 없이는 파일럿 commit 이후에도 production 배포를 승인하지 않는다.

## 8. commit 전 게이트

각 Sprint의 Git commit 직전에는 다음을 확인한다.

1. 해당 Sprint의 필수 검증 명령이 성공했고 결과가 progress에 기록되어 있다.
2. `git diff --check`가 통과한다.
3. staged diff에 다음 Sprint, production credential, 생성물, 사용자 profile 데이터가 섞이지 않았다.
4. `git diff --cached --check`와 staged file 목록을 확인한 뒤 한 Sprint만 담은 commit을 만든다.
