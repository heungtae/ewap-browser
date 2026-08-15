# 08. Sprint 설계 인덱스

## 1. 목적

이 문서는 01~07의 제품 설계를 구현 순서에 맞는 S0~S5로 나눈 상위 인덱스다. Sprint별 상세 설계는 [`sprints/`](sprints/README.md)에 독립 문서로 둔다. 이 문서와 Sprint 문서는 개발 계획이며 구현 완료를 뜻하지 않는다.

실제 진행 상태와 완료 증거의 단일 기준은 [11-sprint-progress.md](11-sprint-progress.md)다. 설계 문서, 작업 카드 또는 검증 계획을 작성한 것만으로 Sprint 상태를 `Completed`로 바꿀 수 없다.

## 2. 진행 순서와 의존성

```text
S0 로컬 기반
 └─ S1 semantic projection preview
     └─ S2 결정적 mutation 기반
         └─ S3 R2 확인·중단·종료 상태
             └─ S4 Native Host·AI Hub 경계 ── 운영 계약 입력
                 └─ S5 Profile/MCP·managed pilot ── 보안·운영 승인
```

기능 의존성은 직렬이다. 문서 검토와 운영 입력 준비는 병행할 수 있지만, 다음 Sprint의 production 기능을 앞 Sprint 완료 전에 노출할 수 없다.

| Sprint | 독립 설계 | 검증 가능한 결과 | 선행 조건 | 다음 단계에 넘기는 계약 |
|---|---|---|---|---|
| S0 | [로컬 개발·시험 기반](sprints/s0-local-development-foundation.md) | 전용 Chrome profile에서 최소 MV3 골격과 test harness가 실행됨 | 없음 | 고정 build/test 명령, permission 상한, 개발/운영 격리 |
| S1 | [semantic projection preview](sprints/s1-semantic-projection-preview.md) | 외부 호출 없이 실제 DOM projection과 stale-ref 폐기를 확인 | S0 `Completed` | sender-bound document identity, redacted projection, preview-only gate |
| S2 | [결정적 mutation 기반](sprints/s2-deterministic-mutation-foundation.md) | controlled fixture에서 R1 primitive와 verifier/value/audit 경계를 확인 | S1 `Completed` | model 비소유 verifier, one-time value binding, mutation/audit contract |
| S3 | [R2 확인·중단·종료 상태](sprints/s3-r2-confirmation-and-terminal-state.md) | local adapter로 confirmation binding과 fail-closed terminal state를 확인 | S2 `Completed` | R2 IPC interface, cancellation, `UNKNOWN` 재시도 금지 |
| S4 | [Native Host·AI Hub 경계](sprints/s4-native-host-and-ai-hub-boundary.md) | mock integration에서 persistent port, SSO/bridge 경계와 no-config 실패를 확인 | S3 `Completed`, 운영 계약 입력 | trusted Host boundary, session binding, normalized failure |
| S5 | [Profile/MCP·managed pilot](sprints/s5-profile-mcp-and-managed-pilot.md) | exact-page Profile/MCP, packaging, rollback과 release gate 증거를 확인 | S4 `Completed`, 보안·운영 승인 준비 | production Ask/Act gate와 managed pilot 후보 |

## 3. 공통 착수 조건

Sprint를 시작하기 전에 모두 확인한다.

1. 직전 Sprint가 [11-sprint-progress.md](11-sprint-progress.md)에서 검증 증거와 commit hash를 가진 `Completed`다.
2. 현재 Sprint 문서의 입력·포함 범위·명시적 제외를 검토했다.
3. 필요한 운영 값이나 승인 owner가 없으면 추측하지 않고 `Blocked`로 기록한다.
4. 현재 Sprint의 작업 카드만 열고 다음 Sprint의 permission, message, tool, network path를 미리 추가하지 않는다.
5. 실제 credential, assertion, production policy와 사용자 profile data를 repository나 fixture에 넣지 않는다.

S0만 선행 Sprint 없이 시작할 수 있다. 현재 계획 상태는 [11-sprint-progress.md](11-sprint-progress.md)를 따른다.

## 4. 공통 종료 조건

각 Sprint는 다음을 모두 만족해야 `Completed`가 된다.

1. 해당 Sprint의 포함 범위만 구현하고 명시적 제외를 침범하지 않는다.
2. [10-sprint-verification-plan.md](10-sprint-verification-plan.md)의 필수 자동·수동 검증을 통과한다.
3. 실행 명령, exit code, test count, 수동 확인, 알려진 제한을 [11-sprint-progress.md](11-sprint-progress.md)에 기록한다.
4. `git diff --check`와 staged diff 범위 검사를 통과한다.
5. 검증된 변경만 하나의 독립 commit으로 만든 뒤 hash를 상태 원장에 기록한다.

검증 실패, 미확정 운영 입력 또는 보안 게이트 보류가 있으면 commit으로 완료를 선언하지 않고 `In progress` 또는 `Blocked`로 남긴다. 다음 Sprint의 사용자 기능은 시작하지 않는다.

## 5. 문서별 책임

| 문서 | 책임 | 완료 선언 가능 여부 |
|---|---|---|
| 이 문서 | 전체 순서, 의존성, 공통 gate | 불가 |
| [`docs/sprints/`](sprints/README.md) | Sprint별 목표, 경계, 핵심 계약, 인계 조건 | 불가 |
| [09-sprint-development-plan.md](09-sprint-development-plan.md) | 작업 순서, 예상 파일·스크립트, commit 경계 | 불가 |
| [10-sprint-verification-plan.md](10-sprint-verification-plan.md) | 실행 가능한 검증과 release-blocking negative case | 불가 |
| [11-sprint-progress.md](11-sprint-progress.md) | 실제 상태, 증거, blocker, commit | 가능; 단 증거 필수 |
| [12-low-cost-agent-implementation-spec.md](12-low-cost-agent-implementation-spec.md) | 카드 단위 구현 계약 | 불가 |

설계 변경은 영향을 받는 Sprint 문서와 09·10의 같은 Sprint 섹션을 함께 갱신한다. 진행 상태는 실제 착수 또는 검증 결과가 생길 때만 11에서 바꾼다.
