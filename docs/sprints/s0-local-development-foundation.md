# S0 — 로컬 개발·시험 기반

## 1. 목표와 종료 시 보이는 결과

신규 Chrome MV3 코드베이스를 안전하게 빌드·검사·실행할 수 있는 재현 가능한 로컬 기반을 만든다. 종료 시 전용 개발 Chrome profile에서 빈 Side Panel, service worker, content script가 로드되고 unit·fixture·E2E 명령이 실패를 올바르게 전파해야 한다. 사용자용 Ask/Act 기능은 열지 않는다.

## 2. 착수 조건과 입력

- 선행 Sprint는 없다.
- Node, package manager, .NET, Chrome의 지원 버전을 결정할 owner가 있어야 한다.
- development extension ID와 production extension ID의 분리 원칙을 승인해야 한다.
- 실제 production origin, credential, SSO assertion 또는 Native Host HKLM 등록은 입력으로 요구하지 않는다.

버전이나 개발 환경 선택이 미확정이면 그 값을 추측해 lockfile·CI에 넣지 않고 S0을 `Blocked`로 기록한다.

## 3. 포함 범위

- `extension/`, `native-host/`, `contracts/`, `tests/`, `scripts/`의 신규 골격과 import boundary
- 최소 MV3 manifest, 빈 Side Panel/service worker/content entry point
- `typecheck`, `lint`, `test:unit`, `test:fixture`, `test:e2e`, `build`, `test` 명령
- 전용 user-data-dir에서 unpacked extension을 로드하는 개발 스크립트
- development-only Native Host 등록·해제 스크립트
- release artifact의 `permission_origins`와 manifest host permission이 일치하는 초기 validator

## 4. 명시적 제외와 feature gate

- 실제 AI Hub, SSO broker, bridge, Page Profile resolver, Business MCP 호출
- production extension ID, HKLM Native Host 설치, enterprise force-install
- browser mutation Company Tool과 production Ask/Act
- `<all_urls>`, 임의 endpoint, 실제 비밀값, 사용자 기본 Chrome profile 변경

S0 smoke의 성공은 제품 기능 또는 production 설치 성공 증거가 아니다.

## 5. 핵심 설계 계약

1. 개발 Chrome은 전용 임시 profile과 `--disable-extensions-except`/`--load-extension`만 사용한다.
2. manifest permission은 구현된 빈 골격에 필요한 최소치만 둔다. policy는 release artifact의 permission 상한을 넓힐 수 없다.
3. bootstrap·build·test 스크립트는 하위 명령 실패를 non-zero로 전달하고 비밀값을 출력하지 않는다.
4. development Native Host 등록은 production 경로·registry key·extension ID를 수정하지 않는다.
5. test harness는 이후 Sprint의 security negative test를 unit, fixture, 실제 Chrome E2E로 분리할 수 있어야 한다.

## 6. 작업 패키지

| 카드 | 결과 | 금지 사항 |
|---|---|---|
| S0-1 | root config, 최소 manifest와 빈 entry point | broad permission, product behavior |
| S0-2 | bootstrap/build/test/Chrome/native-host 개발 스크립트 | 기본 Chrome profile, production registry 접근 |
| S0-3 | fixture server와 Side Panel/service worker/content smoke | mock production success |
| S0-4 | closed schema validator와 import-boundary lint | unknown key 묵인, 계층 우회 import |

상세 파일 경계는 [12의 S0 카드](../12-low-cost-agent-implementation-spec.md#s0-카드)를 따른다.

## 7. 검증과 종료 증거

- 깨끗한 checkout에서 bootstrap, typecheck, lint, build, unit, fixture, Chrome E2E가 재현된다.
- manifest permission snapshot과 development/production policy bundle의 origin 상한 검사가 통과한다.
- Chrome launcher와 Native Host install/uninstall의 개발 환경 격리를 자동·수동으로 확인한다.
- 실행 명령, exit code, test count, Chrome smoke 결과와 알려진 제한을 상태 원장에 기록한다.

정확한 검증 항목은 [10의 S0 검증](../10-sprint-verification-plan.md#2-s0-검증)을 따른다.

## 8. 종료와 S1 인계

S0은 위 증거와 독립 commit hash가 [11-sprint-progress.md](../11-sprint-progress.md)에 기록될 때만 `Completed`다. S1에는 고정된 build/test 명령, permission 상한, 전용 Chrome 실행 환경과 runtime entry point만 넘긴다. projection, runtime message 또는 사용자 기능을 미리 넘기지 않는다.

## 9. 설계 추적

- 코드베이스·신뢰 경계: [01](../01-architecture.md)
- manifest·permission: [03](../03-extension-design.md)
- 배포 격리: [05](../05-deployment-operations.md)
- 검증 계층: [07](../07-verification-and-release.md)
- 개발 계획: [09의 S0](../09-sprint-development-plan.md#2-s0--로컬-개발시험-기반)
