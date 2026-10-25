# Sprint 이력과 남은 작업

현재 동작은 [코드 탐색 안내](../source-guide.md)에서 확인한다. 이 디렉터리의 Sprint
문서는 당시 계획·acceptance 기준·종료 범위를 기록한다. `Completed`는 연결된 날짜의
증거 범위에 한정하며 현재 revision·모든 Provider·운영 사이트·실제 배포를 보장하지 않는다.

## 남은 출시·통합 작업

- [Community 출시와 Enterprise 후속 backlog](community-release-enterprise-followup.md)
- [교차 저장소 계약 과제 C01~C09](../platform-alignment.md#8-contract-gaps)

착수 전 코드와 최근 실행 증거로 남은 범위를 다시 확인한다. 미구현 기능은 backlog로
관리하고 기능별 설계서를 현재 구현의 규범으로 유지하지 않는다.

## Web Codebase Agent migration S26-S37

**S26 completed its recorded baseline; S27–S36 remain In Progress; S37 is Planned.** These 12 Sprints implement the full internal
migration while preserving current UI structure. The 63 implementation cards and
72 verification scenarios define the original scope; completion and runtime evidence are recorded per Sprint.

Start with the [detailed refactoring design](../architecture/web-codebase-agent-refactoring.md),
[Codebase construction rules and budgets](../architecture/web-codebase-construction.md),
and [runtime contracts](../architecture/web-codebase-runtime-contracts.md).
The [migration plan](../architecture/web-codebase-agent-migration-plan.md) retains
the original M00–M11 phases and release metrics. S26 captures the implementation
baseline first; S27 qualifies the JEV controller before S33 can complete.

| Sprint                                       | Migration slice | Scope                                                    | Status  | Cards / scenarios |
| -------------------------------------------- | --------------- | -------------------------------------------------------- | ------- | ----------------- |
| [S26](s26-migration-baseline.md)             | M00             | Migration baseline and preservation inventory            | Completed | 5 / 6             |
| [S27](s27-jev-controller-contract.md)        | M01             | JEV controller protocol and feasibility                  | In Progress | 5 / 6             |
| [S28](s28-workspace-backend-bridge.md)       | M02             | Workspace, preserved UI seam and local backend bridge    | In Progress ([evidence](../evidence/s28-workspace-bridge-2026-10-19.md)) | 5 / 6             |
| [S29](s29-semantic-codebase-construction.md) | M03             | Semantic Codebase construction and repository            | In Progress ([evidence](../evidence/s29-construction-2026-10-19.md)) | 7 / 6             |
| [S30](s30-shared-tool-policy-runtime.md)     | M04             | Shared Tool Registry, policy and browser execution       | In Progress ([evidence](../evidence/s30-runtime-2026-10-19.md)) | 5 / 6             |
| [S31](s31-durable-task-recovery.md)          | M05             | Durable tasks, dispatch receipts and recovery            | In Progress ([evidence](../evidence/s31-durable-recovery-2026-10-20.md)) | 5 / 6             |
| [S32](s32-advanced-browser-collectors.md)    | M06             | Advanced collectors and data coverage                    | In Progress ([evidence](../evidence/s32-advanced-collectors-2026-10-20.md)) | 5 / 6             |
| [S33](s33-jev-task-orchestration.md)         | M07             | JEV-owned Ask/Act and workflow orchestration             | In Progress ([evidence](../evidence/s33-orchestration-2026-10-21.md)) | 5 / 6             |
| [S34](s34-gpt-evidence-analysis.md)          | M08             | GPT evidence analysis and provider-role migration        | In Progress ([evidence](../evidence/s34-evidence-analysis-2026-10-21.md)) | 5 / 6             |
| [S35](s35-mcp-external-adapters.md)          | M09             | MCP gateway and external integration adapters            | In Progress ([evidence](../evidence/s35-mcp-gateway-2026-10-21.md)) | 5 / 6             |
| [S36](s36-migration-qualification.md)        | M10             | Data conversion, UI continuity and release qualification | In Progress ([presentation/gate evidence](../evidence/s36-presentation-2026-10-25.md)) | 6 / 6             |
| [S37](s37-cutover-legacy-retirement.md)      | M11             | Production cutover and legacy runtime retirement         | Planned ([preflight](../evidence/s37-retirement-preflight-2026-10-24.md)) | 5 / 6             |

Each Sprint defines source/target ownership, prerequisites, acceptance checks,
evidence requirements and rollback. The target replaces optional-JEV/primary
orchestration at cutover; historical S25 behavior and evidence below remain
unchanged. Advanced collectors, MCP, data migration and installed release
verification are required for full migration completion.

## 신규 구현 계획

- [Browser Agent S25 — TypeSafe Jev 판단 모델과 기존 LLM 라우팅](s25-jev-model-routing.md)
  — Browser-local 구현, 2026-10-14. Provider 역할 설정·이관, 네이티브 판단,
  기존 모델 위임·결과 확인과 취소·승인 경계를 연결했다. Jev가 없거나 불완전하면
  기존 모델만 사용한다. [통제 검증](../evidence/s25-jev-routing-2026-10-14.md)을 제공하며
  실제 TypeSafe 모델 쌍과 holdout/cost/latency qualification은 미완료다.

- [Browser Agent S24 — 페이지 프로필과 작업별 명령](s24-learned-page-profiles.md)
  — Browser-local 구현, 2026-10-13. Options 관리와 Ask/Act 통제 Chrome,
  OpenRouter Ask 재사용 검증. 전체 acceptance qualification은 In Progress.

- [Browser Act S23 — Provider의 페이지 스크립트 분석과 메서드 호출](s23-provider-page-method-execution.md)
  — In Progress, 2026-10-12. 빌드 계측으로 발생한 Chrome inventory 누락을 수정했다.
  통제 Chrome 호출·결과 continuation은 통과했으며 실제 Provider·R01~R20 qualification은 미완료다.
  기존 Sprint와의 충돌/보존 경계 X01~X12를 추적한다.
- [Browser Agent S22 — 통합 승인 정책과 Full Permission 자동 실행](s22-unified-approval-policy.md)
  — 구현·검증 진행 중, 2026-10-12. Options·공통 승인 정책 구현과 일부 무료 Provider live
  표본을 검증한 뒤 [OpenAI 재검증](../evidence/s22-live-openai-2026-10-12.md)에서
  holdout 15/15·혼합 2/2와 기본 재검증을 통과했다. 최초 실패를 보존하며
  C1~C8/R1~R18 전체 qualification은 미완료다.
- [Browser Act S21 — 현재 관찰·실행 증거에 기반한 LLM 추가 판단](s21-act-evidence-based-llm-assessment.md)
  — Planned, 2026-10-11. 기존 경로를 유지하고 요소 해석·action 완료·전체 목표의
  불명확한 상태를 자료 수집과 LLM 판단으로 확정하는 C1~C8 계획이다.

## 개발·검증 이력

[진행 기록](../sprint-progress.md)은 여러 날짜의 갱신을 보존한 이력이다.
실행 명령은 [테스트 가이드](../test.md), 결과는 [증거 안내](../evidence/README.md)를 따른다.

- [S0](s0-local-development-foundation.md)
- [S1](s1-semantic-projection-preview.md)
- [S2](s2-deterministic-mutation-foundation.md)
- [S3](s3-llm-provider-plugin.md)
- [S4](s4-user-settings-local-network.md)
- [S5](s5-chat-workspace-ui.md)
- [S6](s6-advanced-page-reading.md)
- [S7](s7-generic-browser-act.md)
- [S8](s8-permission-modes-hardening.md)
- [S9](s9-cross-platform-release.md)
- [S10 Browser 로컬 Page Profile 수락](s10-profile-runtime.md)
- [Browser S10-C1~C5 Page API/Discovery 기록](s10-page-api-discovery-handoff.md)
- [S10-R Browser Page API 취소·요청 바인딩 보강](s10-r-page-api-request-cancellation.md)
- [S11 Browser 로컬 Business MCP binding](s11-business-mcp-binding.md)
- [기존 Browser Collection Reading S11-C1~C6 기록](s11-collection-reading-chrome-completion.md)
- [S12 Browser 로컬 managed policy 경계](s12-managed-policy-boundary.md)
- [기존 Browser 진단 ZIP S12-C1~C6 기록](s12-diagnostics-download-bundle.md)
- [S13 Browser 로컬 Act evidence](s13-runtime-evidence-browser.md)
- [Browser Ask/Act 분석 수집 S13-C1~C8](s13-ask-act-analysis-data-acquisition.md)
- [S14 Browser 로컬 기록 비교](s14-studio-integration-browser-boundary.md)
- [Browser Act S15 / PAH-9 LLM의 입력값 판단·자동 입력·추가 질문](s15-pah-9-llm-input-value-binding.md)
- [Browser Act S16 페이지 script 탐색과 도구 결과 반환](s16-page-script-tool-loop.md)
- [Browser Act S17 기록 제출과 실행 결과의 LLM 피드백](s17-act-plan-execution-feedback.md)
- [Browser Act S18 Workflow 목록·원본 읽기와 LLM 검토](s18-workflow-resource-tools.md)
- [Browser Act S19 Component 발견과 데이터·시각 읽기 도구](s19-component-data-tools.md)
- [Browser Act S20 전체 도구 루프의 live 검증과 호환성](s20-act-tool-loop-live-qualification.md)
