# Browser Act S16 — 페이지 script 탐색과 도구 결과 반환

## 상태와 진입 조건

**Completed — 2026-10-09.** Browser-local Act 후속 개발 단계다.
기준은 [34번 설계 16절](../34-page-act-context-harness-design.md#16-도구-사용법-제공과-llm-탐색실행-루프의-완성)이다.
현재 Act의 UI 읽기 loop와 request/document 결속을 재사용한다. 입력 요청 회귀는
[S15 / PAH-9](s15-pah-9-llm-input-value-binding.md)의 변경 계약을 따른다.
구현과 검증은 [2026-10-08 증거](../evidence/s16-script-tool-loop-2026-10-08.md)를 따른다.
C1~C6의 Browser-local 연결 검증을 완료했다.
[10월 9일 수정 전 Nemotron live 실패](../evidence/s16-live-nemotron-2026-10-09.md)를 수정하고
[최종 live 재검증](../evidence/s16-live-tool-loop-fix-2026-10-09.md)에서
목록·검색·부분 읽기·동일 대화 결과 반환·계산 설명·진단 ZIP 마스킹을 통과했다.
137 files / 645 tests, S16 Chrome 6/6, S15 입력 Chrome 회귀 6/6도 통과했다.
보조 source-size 검사는 별도로 미통과이며, 완료 범위는 통제 HTTPS fixture와 지정 모델의
Browser-local 도구 연결이다. 운영 사이트·임의 Provider·배포·Platform 완료로 확장하지 않는다.

## 목표와 경계

LLM이 최초 요청에서 script의 위치를 몰라도 목록→검색→부분 읽기로 필요한 근거를
확보하고 결과를 받은 뒤 다음 행동을 판단한다. inline/external script는 정적 읽기
자료이며 함수 실행·임의 endpoint 호출 권한을 제공하지 않는다.

## 구현 카드와 순서

| 카드   | 수정 영역과 산출물                                                                                  | 종료 조건                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| S16-C1 | 공통 registry: name/description/parameters/result schema, executor, mode/phase, 동의/binding/budget | callable schema·capability·dispatch가 같은 등록을 사용. executor 부재는 미지원으로 표시      |
| S16-C2 | content/service-worker의 실제 페이지 resource 수집과 bootstrap inventory 연결                       | opaque ID/revision을 가진 설명·inline/external script 목록을 최초 context와 목록 도구로 제공 |
| S16-C3 | list_page_resources/search_page_resources/read_page_resource function schema·parser·executor        | 목록 pagination, 검색 hit/range, bounded chunk와 continuation을 실제 DOM/source에 대해 반환  |
| S16-C4 | 기존 source 전달 동의·host/fetch/마스킹 경계를 새 읽기 경로에 연결                                  | CONSENT_REQUIRED→실제 승인→동일 call 결과 또는 DENIED. 동의 전 본문 전달 없음                |
| S16-C5 | act-harness-turns의 공통 결과·오류·취소·budget continuation                                         | UI와 script 결과를 같은 대화에 tool_call_id로 반환하고 모델의 다음 호출 수행                 |
| S16-C6 | 계약/unit·Chrome·live Provider 검증 및 증거                                                         | 아래 시나리오의 실제 offered schema·호출·결과·다음 turn 확인                                 |

재사용 대상은 page-act-harness/resource-inventory.ts, resource-reader.ts,
capability-check.ts와 service-worker/act-harness-turns.ts, act-chat-start.ts다.
내부 SourceStore의 존재를 실제 script 수집 완료로 간주하지 않는다. 검색은 허용된
자료에서 수행하고 결과 발췌도 마스킹한다. origin/credential 정책을 우회하는 fetch는 없다.

## 검증 행렬

| ID     | 시나리오                                                      | 기대 결과                                                                            |
| ------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| S16-R1 | 처음 보는 페이지에서 필요한 함수 위치 미상                    | LLM이 목록·검색·부분 읽기를 선택. 파일명/함수명을 제품 코드가 고르지 않음            |
| S16-R2 | 여러 script·큰 bundle·검색/읽기 잘림                          | next_cursor/range/coverage로 추가 읽기. 부분 결과를 전체 코드 검토로 표시하지 않음   |
| S16-R3 | source 동의 필요·허용·거부                                    | 응답까지 대기. 승인된 범위만 읽고 결과를 원래 호출에 반환. 거부는 모델에 DENIED 반환 |
| S16-R4 | inline/external script의 token·URL 비밀값·읽을 수 없는 source | provider egress·검색 발췌·trace/export 원문 유출 없음. 실패/미지원 상태 반환         |
| S16-R5 | navigation·source revision 변경·Stop·worker restart           | 예전 resource/cursor/동의 재사용 없음. 취소된 요청의 늦은 결과로 다음 mutation 없음  |
| S16-R6 | 잘못된 인자·중복 call ID·budget 소진                          | 계약 오류/INCOMPLETE를 명확히 표시. 빈 성공이나 다른 도구로 조용한 우회 없음         |

## 다음 live Provider 테스트의 기본 설정

Provider·모델·인증 환경 변수·빌드와 실행 명령·결과 기록 방법은
[테스트 실행 가이드](../test.md)를 따른다.

## 완료 조건과 산출물

- 최초 요청에 script 도구의 실제 사용법이 있고 LLM이 선택할 수 있다.
- 목록→검색→읽기→결과→추가 판단을 실제 source와 동일 conversation에서 검증한다.
- UI만으로 충분한 입력 요청에서는 LLM이 불필요한 script 읽기를 생략할 수 있다.
- 변경 계약/unit, typecheck/lint, 버전 보존 build와 관련 Ask/Act·마스킹 회귀를 확인한다.
- 통제 Provider + Chrome의 연결 증거와 live Provider의 선택 증거를 분리한다.
- evidence에 명령·provider/model/prompt/artifact revision, 호출·범위·실패·미검증 항목을 기록한다.

다음 단계는 [S17](s17-act-plan-execution-feedback.md)이다. 문서 작성만으로 완료하거나
다음 개발을 자동 시작하지 않는다. 전체 단계는 [PAH 계획](../sprint-page-act-context-harness-plan.md)에 연결한다.
