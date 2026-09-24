# Sprint 설계 인덱스

## Enterprise Web AI Platform 정렬 (2026-08-31)

기존 S0\~S9는 **Community Browser Runtime foundation**으로 유지한다.
이후 Enterprise integration sprint를 추가한다.

## S0~S9 종료 판정 범위 (2026-09-24)

S0~S9는 이 저장소의 Browser 기반을 현재 Linux 개발 환경과 통제된
Chrome for Testing fixture에서 검증하는 단위다. [31번](31-act-request-execution-current-implementation.md)과
[33번](33-ask-request-execution-current-implementation.md)의 Ask/Act AS-IS 경로를
검증 대상으로 삼는다. [32번](32-ask-act-analysis-data-acquisition-design.md)의
복수 source 선택·승인 후 재개·reviewed `page_api_read`는 후속 S6-R/S13 범위이며
S0~S9 완료를 그 기능의 완료로 해석하지 않는다.

현재 작업 환경에서 수행할 수 없는 Windows clean-profile 검증과 별도
release reviewer 승인은 S0~S9의 `Completed` 판정 조건에서 제외한다.
S9의 `Completed`는 Linux 로컬 release candidate 검증 완료를 뜻한다.
Windows 배포 및 대외 출시는 별도 출시 판정을 요구한다. 실제 회사 Provider와
특정 운영 사이트의 성공 여부도 31·33번 문서처럼 이 판정 범위 밖이다.

삭제한 외부 조건 대신 통제된 HTTPS Provider/페이지 fixture, 현재 빌드의
실제 Extension/Side Panel/Service Worker Chrome 동작, 권한·민감정보·CDP
negative matrix, Stop/recovery와 패키지 무결성 검증은 유지한다. 수행하지
못한 필수 검증은 `Completed`로 기록하지 않고 blocker로 남긴다.
S0의 인증 경계는 Community 로컬 실행에 제품 로그인이 필수인지로 판정한다.
현재 저장소의 선택적 managed policy/identity 코드를 존재하지 않는다고
주장하지 않는다.

| Sprint | 31~33번 기준으로 검증하는 Browser 경계 |
| --- | --- |
| S0 | MV3 Worker·Panel·Content 실행과 로컬 시작 기반 |
| S1 | 33번 1~2단계의 Ask 요청·초기 projection·Profile fail-closed |
| S2 | 31번 7단계의 승인·target 재검사·bounded dispatch·결과 검증 |
| S3 | 31·33번 Provider turn의 plugin 인증·stream·취소 |
| S4 | 31·33번 Settings·Profile-bound Business MCP와 secret 경계 |
| S5 | 31·33번 Panel event·Stop·복구 표시 |
| S6 | 33번 5단계 read tool과 projection의 read-only 경계 |
| S7 | 31번 6~7단계 generic Act proposal·dispatch·verifier |
| S8 | 31번 7단계 permission mode와 hard policy 유지 |
| S9 | 위 경계의 Linux package·설치·upgrade·rollback 통합 검증 |

32번 4단계 분석 수집의 후속 기능은 S6-R/S13에서 닫는다. S0~S9
증거에는 현재 구현된 단일 collection 경로의 회귀만 포함할 수 있다.

  Sprint   주제
  -------- ----------------------------------------------------------------
  S10      Signed Page Profile Resolver + semantic enrichment
  S11      MCP Server Registry/discovery + capability filtering
  S12      Enterprise Identity/RBAC/PDP + managed permission mode
  S13      Runtime Evidence + central audit
  S14      Enterprise Studio capture/validation/change-impact integration
  S15      Managed Chrome/on-prem/air-gap release hardening

  ----------------------------------------------------------------------------------------------
  Sprint   주제                          설계
  -------- ----------------------------- -------------------------------------------------------
  S0       개발·패키지 기반              [S0](sprints/s0-local-development-foundation.md)

  S1       semantic projection과 Ask     [S1](sprints/s1-semantic-projection-preview.md)

  S2       실행 승인과 bounded CDP       [S2](sprints/s2-deterministic-mutation-foundation.md)
           mutation                      

  S3       LLM provider plugin           [S3](sprints/s3-llm-provider-plugin.md)
           foundation                    

  S4       plugin Settings와 local       [S4](sprints/s4-user-settings-local-network.md)
           network                       

  S5       Chat workspace UI             [S5](sprints/s5-chat-workspace-ui.md)

  S6       hidden DOM·Vision·Tab 고급    [S6](sprints/s6-advanced-page-reading.md)
           읽기                          

  S7       범용 Browser Act와 기존 코드  [S7](sprints/s7-generic-browser-act.md)
           완성                          

  S8       permission mode와             [S8](sprints/s8-permission-modes-hardening.md)
           permission-less hardening     

  S9       Linux 로컬 release candidate  [S9](sprints/s9-cross-platform-release.md)
  ----------------------------------------------------------------------------------------------
