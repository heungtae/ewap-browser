# 검증 증거 안내

[S24 scoped commit verification](s24-scoped-delivery-2026-10-14.md): 다른 미커밋 변경을 제외한 커밋 후보의 빌드·96개 테스트·통제 Chrome Ask/Act 재검증.

## 2026-10-14 S24 관리 창

[Separate profile management window](s24-profile-manager-2026-10-14.md): 목록·상세 편집,
검색·페이지 이동·삭제·동시 편집, 대화 복구의 창 바인딩, 통제 Chrome Ask/Act와 화면 증거.

## 2026-10-13 S24

[Learned profiles and page commands](s24-learned-page-profiles-2026-10-13.md): controlled Chrome Ask/Act, live OpenRouter Ask and Options evidence; qualification limits recorded.


이 디렉터리는 실행 당시의 revision·환경·명령·결과·실패·미검증 범위를 보존한다.
현재 기능의 SSOT는 [코드](../source-guide.md)이며, 과거 PASS를 현재 revision의
검증 결과로 재사용하지 않는다. 재현 명령은 [테스트 가이드](../test.md)를 따른다.

## 도구 루프 검증

| 범위                        | 기록                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| S15 입력값·질문             | [최종 수정·live 검증](s15-live-fix-2026-10-09.md), [수정 전 실패](s15-live-openai-verification-2026-10-09.md) |
| S16 script 목록·검색·읽기   | [최종 수정·live 검증](s16-live-tool-loop-fix-2026-10-09.md), [Nemotron 검증](s16-live-nemotron-2026-10-09.md) |
| S17 계획·실행 결과 피드백   | [구현·통제 결과](s17-plan-feedback-2026-10-09.md), [OpenAI 결과](s17-live-openai-luna-2026-10-09.md)          |
| S18 Workflow 원본·검토      | [통제·live 결과](s18-workflow-resources-2026-10-10.md)                                                        |
| S19 Component 데이터·vision | [구현·통제·live 결과](s19-component-tools-2026-10-10.md)                                                      |
| S20 종합 qualification      | [사전 측정 계획](s20-measurement-plan-2026-10-10.md), [결과와 한계](s20-qualification-2026-10-10.md)          |

S20 기록은 Browser-local qualification과 지정 live 표본의 결과다. 실패한
공급자·재실행·incomplete 결과를 보존하며 모든 요청의 성공이나 출시 준비를 뜻하지 않는다.
JSON 증거는 각 기록에서 연결한다.

## 기반 기능과 회귀 기록

| 범위                                          | 기록                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 웹 요소 발견·도구·실행·검증 지원 범위         | [호환성 audit와 26개 통제 관찰](web-element-compatibility-audit-2026-10-11.md)                                                                                            |
| Act 이동 후 목표 확인                         | [ISS-20261011-001 수정 검증](act-completion-after-navigation-2026-10-11.md)                                                                                               |
| Community 설치·독립 실행                      | [readiness](community-readiness-2026-10-04.md), [Linux 패키지 검증](s9-closure-2026-09-26.md)                                                                             |
| Collection Reading                            | [S6-R](s6-r-closure-2026-10-01.md)                                                                                                                                        |
| Page API·취소·요청 binding                    | [Page API](s10-page-api-closure-2026-10-01.md), [취소](s10-r-request-cancellation-2026-10-01.md)                                                                          |
| 분석 데이터 획득                              | [S13](s13-analysis-closure-2026-10-04.md)                                                                                                                                 |
| 진단 ZIP                                      | [closure](diagnostics-zip-closure-2026-10-01.md)                                                                                                                          |
| Profile·MCP·managed policy·evidence·기록 비교 | [S10](s10-progress-2026-09-26.md), [S11](s11-closure-2026-09-26.md), [S12](s12-closure-2026-09-27.md), [S13](s13-closure-2026-09-27.md), [S14](s14-closure-2026-09-27.md) |
| PAH 초기 unit slice·후속 재검증               | [초기 구현 기록](pah-implementation-record.md), [재검증](pah-review-reverification-c63ee1ad1-2026-10-06.md)                                                               |

나머지 날짜별 기록은 [디렉터리](.)와 [Sprint 진행 기록](../sprint-progress.md)에서 찾는다.
이전 설계가 필요한 기록은 삭제 전 커밋에 고정된 링크를 사용한다.

- [ARIA checked 컨트롤 수정 검증 — 2026-10-11](aria-checked-control-fix-2026-10-11.md): ISS-20261011-002 bounded 구현·Chrome·회귀 범위.

- [S21 추가 판단 구현·검증 — 2026-10-11](s21-assessment-2026-10-11.md): dispatch·freshness·budget·승인·UI, 통제 및 실제 provider 표본과 미검증 범위.

- [S23 Provider 페이지 메서드 구현·통합 확인 — 2026-10-11](s23-provider-page-method-2026-10-11.md): approval/schema/runner 구현 및 회귀 통과. Act inventory가 Chrome에서 비어 승인 호출까지 이어지지 않은 실패와 미검증 범위.

- [ISS-20261011-004 이동 UNKNOWN 후 완료 확인](../issues/records/2026-10-11-navigation-provider-confirmation.md): 목적지 바인딩, 통제 Chrome 수용/거절, 회귀 실행 및 미검증 범위.

- [ISS-20261011-004 URL 진단 검증 — 0.1.103](iss-20261011-004-url-diagnostics-2026-10-11.json): 0.1.102 재현, 명시적 URL 마스킹 제거, 실제 Chrome export에서 URL 보존 및 완료 수용/거절 검증.

- [ISS-20261011-004 승인 주소 도착 후 URL 전환 분석](iss-20261011-004-destination-transition-2026-10-11.json): 0.1.103 진단의 동일 documentId 주소 변경 및 DESTINATION_MISMATCH 확인; 분석과 축소 재현 범위.

- [ISS-20261011-004 provider completed 최종 수용](iss-20261011-004-provider-completion-2026-10-11.json): 0.1.104, 단위 813개·통제 Chrome 세 사례 및 request/session 복원 확인. [완료 표시](iss-20261011-004-provider-completed.png). 원래 사이트/live provider·설치 확인은 별도.

- [ISS-20261011-003 일반 클릭 실행 전 completion 차단 분석](iss-20261011-003-click-preflight-2026-10-11.json): 0.1.104 실제 사이트 진단; not_dispatched / UNSUPPORTED_COMPLETION과 provider incomplete 확인. 분석·축소 재현 범위.

- [ISS-20261011-003 일반 클릭 사전 차단 수정](iss-20261011-003-generic-click-fix-2026-10-11.json): 승인·UNKNOWN receipt·모델 확인을 포함한 통제 Chrome S21 9/9; 실제 사이트/live provider·배포 제외.

S21/S22 추가 구현의 [커밋 전 검증과 남은 범위](s21-s22-precommit-2026-10-11.md).

- [S23 리뷰 후 구현·검증 — 2026-10-12](s23-page-method-review-2026-10-12.md): identity/중복/계획/반환 보강, controlled matrix, live OpenRouter holdout 및 OpenAI UI PASS. Browser-local Completed; 최초 429/503 실패 보존.
