# 10. Sprint 검증 계획서

## 1. 공통 실행 규칙

검증은 개발자 로컬 환경에서 재현 가능해야 한다. 명령 이름은 S0에서 확정하고 이후 Sprint는 동일 명령을 확장한다. 각 Sprint 완료 시 실행한 정확한 명령, 결과 요약, test count, commit hash를 [11-sprint-progress.md](11-sprint-progress.md)에 남긴다. 계획된 명령을 아직 실행하지 않은 상태를 성공으로 표기하지 않는다.

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
| Script safety | Chrome launcher가 기본 user-data-dir를 사용하지 않으며, native-host install/uninstall이 개발 전용 대상만 변경한다. |
| Chrome smoke | 개발 Chrome에서 Side Panel이 열리고 service worker/content script가 시작된다. |
| Regression | `test-local`이 skeleton unit/fixture/E2E를 실행하며 실패를 전파한다. |

## 3. S1 검증

- unit: ref/document epoch, redaction, runtime message schema, sender validation, Ask mutation deny.
- fixture/E2E: semantic AX snapshot과 `ref_id` 탐색, navigation 후 stale ref 폐기, Side Panel Ask rendering.
- security negative: page `postMessage`, unknown runtime `kind`, raw input value가 포함된 snapshot을 거부한다.

## 4. S2 검증

- unit: exact origin matching, unknown profile deny, R1 policy, sensitive-field deny, audit allowlist serializer.
- fixture/E2E: text/select/checkbox의 preflight와 post-action AX verifier를 각각 검사한다.
- security negative: Ask mutation, blocked origin, stale/occluded target, raw value·URL path audit leak이 모두 실패한다.

## 5. S3 검증

- unit: digest binding, one-time token, approval reject/expiry, terminal state transition, retry prohibition.
- fixture/E2E: R2 click/key의 confirmation, navigation 중 확인 무효화, Stop, content disconnect, verifier failed/unknown을 검사한다.
- security negative: R2 no-confirmation, R3 request, `UNKNOWN` 재시도, worker restart 뒤 mutation 복구가 모두 거부된다.

## 6. S4 검증

- unit/contract: Native Messaging framing, allowed extension ID, malformed payload, cancellation, header allowlist, error mapping.
- local integration: mock SSO broker와 localhost mock bridge로 assertion success/failure, timeout, cancellation, response-size 제한을 재현한다.
- security negative: 임의 extension origin, arbitrary URL/shell command, Authorization/cookie forwarding, stdout diagnostic leakage를 거부한다.
- 운영 입력 미제공 환경: 실제 endpoint 호출 없이 `AI_HUB_NOT_CONFIGURED`를 확인한다.

## 7. S5 검증

- unit/contract: profile expiry/change tool withdrawal, MCP failure fail-closed, managed policy schema/version failure.
- packaging: manifest permission snapshot, package hash, host hash, policy hash, signed update manifest 형식과 compatibility matrix를 검사한다.
- clean Windows VM/manual: managed policy install, host registry/ACL, installer health check, rollback/policy disable, Side Panel status code를 확인한다.
- release gate: 07의 모든 자동 항목 성공 및 Security/IAM/AI Hub/Endpoint/Data owner의 별도 승인 증적 없이는 파일럿 commit 이후에도 production 배포를 승인하지 않는다.

## 8. commit 전 게이트

각 Sprint의 Git commit 직전에는 다음을 확인한다.

1. 해당 Sprint의 필수 검증 명령이 성공했고 결과가 progress에 기록되어 있다.
2. `git diff --check`가 통과한다.
3. staged diff에 다음 Sprint, production credential, 생성물, 사용자 profile 데이터가 섞이지 않았다.
4. `git diff --cached --check`와 staged file 목록을 확인한 뒤 한 Sprint만 담은 commit을 만든다.
