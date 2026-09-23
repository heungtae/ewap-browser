# S13 — Ask/Act 분석 데이터 수집 연결

## 목표

문서 31~33과 목표 계약인 문서 32를 구현해 Ask/Act의 자연어 분석 요청이
Collection Reading 또는 reviewed read-only Page API adapter를 안전하게 발견·선택·
수집하고, bounded 결과만 같은 Provider 요청에 전달하도록 연결한다.

## 선행 조건

- S10의 `page_api_read` binding/adapter 경계가 확정된다.
- S11의 collection reader가 Chrome fixture에서 coverage evidence를 생성한다.
- 현재 Ask/Act request lifecycle과 read-only Provider tool loop가 green이다.

## 구현 범위

1. Ask/Act 공통 단계 3.1 route 결정(`QUESTION`, `ANALYSIS_READ_REQUIRED`, `ACTION_REQUIRED`)
2. 단계 4.1 source discovery: collection descriptor와 Page API availability 결합
3. 단계 4.2 unique source 자동 선택, 복수/모호 source의 Panel 선택, R0 권한 분리
4. 단계 4.3 collection/read-only adapter bounded read와 Stop/timeout/scope fail-closed
5. 단계 4.4 `AnalysisDataContext` 정규화 및 coverage/reason/evidence 보존
6. Ask의 read-only answer runner와 Act의 analysis-first/action-required 분기 연결
7. Act 분석 성공과 mutation approval/dispatch/verification을 분리
8. adapter 없는 Discovery 후보의 `REQUIRES_ADAPTER_REVIEW` 처리
9. Provider·chat history·diagnostics·export·storage의 raw row/cursor/selector/function/
   endpoint/page object 비전달 검증
10. `partial|viewport_only|unavailable`의 과장 답변 방지 및 navigation/Stop 재사용 금지

## 구현 카드

| 카드   | 산출물                     | 종료 조건                                                                                                                                                |
| ------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S13-C1 | route gate                 | 사용자 선택 mode를 바꾸지 않고 closed route만 반환                                                                                                       |
| S13-C2 | source discovery/selection | unique 자동 선택, ambiguous Panel 선택, stale 폐기                                                                                                       |
| S13-C3 | R0 acquisition runtime     | collection/API read 분리, no retry, bounded terminal                                                                                                     |
| S13-C4 | analysis context           | sanitized records, count, coverage, reason, truncated만 전달                                                                                             |
| S13-C5 | Ask integration            | 분석 source 결과 후 read-only Provider answer 재개                                                                                                       |
| S13-C6 | Act integration            | 분석 후 별도 proposal/approval/preflight/verification                                                                                                    |
| S13-C7 | security and lifecycle     | raw candidate/data 비노출, Stop/navigation/restart cleanup                                                                                               |
| S13-C8 | Chrome/provider matrix     | Ask·Act fixture의 discover→read→answer/proposal evidence. 실제 Side Panel·service worker·HTTPS 제어 provider fixture까지 구현; live provider 검증은 별도 |

## S13-C4 Provider context cap 보정 (2026-09-23)

reader의 `complete` 결과도 Provider 전달 단계의 record/byte/cell cap에서
잘릴 수 있다. 이때 Provider context의 `truncated`를 켜고 `coverage=partial`,
`reason=CONTEXT_TRUNCATED`로 표시한다. reader가 이미 `partial` 또는
`viewport_only`인 경우 기존 coverage와 terminal reason을 유지한다.
`collected_count`는 reader 수집 행 수이고 `records.length`는 Provider에
실제로 전달된 행 수다. Ask·Act의 Provider 지시에도 이 차이를 명시한다.

이 변경은 S13-C4의 Provider 범위 표시 구현이며, 복수 source 선택과
승인 후 재개, Page API read adapter, live provider 및 virtual-scroll
완전성 증거를 완료 처리하지 않는다.

## S13-C7 Ask tool loop의 scope 재검사 (2026-09-23)

Ask가 collection 분석 데이터를 받은 경우 각 Provider 호출 직전과 응답 직후
현재 tab의 snapshot을 다시 읽는다. 수집 당시 document/page scope와 다르거나
페이지를 확인할 수 없으면 `PAGE_SCOPE_STALE`로 종료한다. 검사가 끝나기 전에는
해당 Provider turn의 assistant delta를 Panel에 표시하지 않는다. 이 경계는
첫 답변과 read-only tool 호출 뒤 이어지는 Provider turn에 모두 적용된다.

런타임/Chrome 증거와 복수 source 선택·권한 승인 뒤 재개는 별도 완료 조건이다.

## 완료 조건

- Ask의 페이지 데이터 분석이 safe unique source를 통해서만 bounded context를 받는다.
- Act의 저장/변경은 분석 read 성공만으로 실행되지 않고 기존 승인·검증을 통과한다.
- collection 전체/virtual/pagination/chart 및 Page API read의 coverage를 정확히 표시한다.
- 실제 Provider 검증과 fixture 검증을 구분하고, Chrome evidence 없이는 완료 처리하지 않는다.

## 참고 문서

- [31. Act 요청 처리 현재 구현](../31-act-request-execution-current-implementation.md)
- [32. Ask/Act 분석 데이터 수집 통합 설계](../32-ask-act-analysis-data-acquisition-design.md)
- [33. Ask 요청 처리 현재 구현](../33-ask-request-execution-current-implementation.md)
