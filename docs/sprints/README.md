# Sprint 이력과 남은 작업

현재 동작은 [코드 탐색 안내](../source-guide.md)에서 확인한다. 이 디렉터리의 Sprint
문서는 당시 계획·acceptance 기준·종료 범위를 기록한다. `Completed`는 연결된 날짜의
증거 범위에 한정하며 현재 revision·모든 Provider·운영 사이트·실제 배포를 보장하지 않는다.

## 남은 출시·통합 작업

- [Community 출시와 Enterprise 후속 backlog](community-release-enterprise-followup.md)
- [교차 저장소 계약 과제 C01~C09](../platform-alignment.md#8-contract-gaps)

착수 전 코드와 최근 실행 증거로 남은 범위를 다시 확인한다. 미구현 기능은 backlog로
관리하고 기능별 설계서를 현재 구현의 규범으로 유지하지 않는다.

## 신규 구현 계획

- [Browser Agent S24 — 성공한 Ask/Act 요청의 페이지 프로필 자동 저장·재사용](s24-learned-page-profiles.md)
  — Planned, 2026-10-13. 오류 없는 정상 완료의 학습 적격 기준, 동일 페이지·작업 판정,
  로컬 저장·자동 재사용·Provider 대안 성공 시 해당 방법 갱신·Options 항목별 관리/내용 보기와
  C1~C9/R01~R28을 설계했다. 코드 미구현.
- [Browser Act S23 — Provider의 페이지 스크립트 분석과 메서드 호출](s23-provider-page-method-execution.md)
  — In Progress, 2026-10-12. 빌드 계측으로 발생한 Chrome inventory 누락을 수정했다.
  통제 Chrome 호출·결과 continuation은 통과했으며 실제 Provider·R01~R20 qualification은 미완료다.
  기존 Sprint와의 충돌/보존 경계 X01~X12를 추적한다.
- [Browser Agent S22 — 통합 승인 정책과 Full Permission 자동 실행](s22-unified-approval-policy.md)
  — Planned, 2026-10-11. Options의 승인 모드·항목별 설정을 작업 제안·계획·권한·중요 확인·
  자료 전송 동의에 연결하는 C1~C8 계획이다. 기존 설정의 안전한 이전과 자동 실행 검증을 포함한다.
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
