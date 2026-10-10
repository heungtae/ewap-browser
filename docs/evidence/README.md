# 검증 증거 안내

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
| Community 설치·독립 실행                      | [readiness](community-readiness-2026-10-04.md), [Linux 패키지 검증](s9-closure-2026-09-26.md)                                                                             |
| Collection Reading                            | [S6-R](s6-r-closure-2026-10-01.md)                                                                                                                                        |
| Page API·취소·요청 binding                    | [Page API](s10-page-api-closure-2026-10-01.md), [취소](s10-r-request-cancellation-2026-10-01.md)                                                                          |
| 분석 데이터 획득                              | [S13](s13-analysis-closure-2026-10-04.md)                                                                                                                                 |
| 진단 ZIP                                      | [closure](diagnostics-zip-closure-2026-10-01.md)                                                                                                                          |
| Profile·MCP·managed policy·evidence·기록 비교 | [S10](s10-progress-2026-09-26.md), [S11](s11-closure-2026-09-26.md), [S12](s12-closure-2026-09-27.md), [S13](s13-closure-2026-09-27.md), [S14](s14-closure-2026-09-27.md) |
| PAH 초기 unit slice·후속 재검증               | [초기 구현 기록](pah-implementation-record.md), [재검증](pah-review-reverification-c63ee1ad1-2026-10-06.md)                                                               |

나머지 날짜별 기록은 [디렉터리](.)와 [Sprint 진행 기록](../sprint-progress.md)에서 찾는다.
이전 설계가 필요한 기록은 삭제 전 커밋에 고정된 링크를 사용한다.
