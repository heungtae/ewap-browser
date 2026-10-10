# Browser Act S19 — Component 발견과 데이터·시각 읽기 도구

## 상태와 진입 조건

**Completed (Browser-local) — 2026-10-10.**
[구현·검증 증거](../evidence/s19-component-tools-2026-10-10.md): 지원 채널·bounded scroll과
펼침·페이지 이동의 기존 계획·동작 승인 후 재개를 검증했다. 통제 Chrome 21/21,
승인 후 재개 최신 통제/live 각 2/2가 통과했다. partial·미지원 채널의 한계는 유지한다.
순차 진입은 [S18](s18-workflow-resource-tools.md) 이후이며,
기술 의존성은 [S16](s16-page-script-tool-loop.md)의 resource registry와
[S17](s17-act-plan-execution-feedback.md)의 실행·관찰 계약이다.
기준은 [34번 설계](../34-page-act-context-harness-design.md)의 7·16절이다.

## 목표와 경계

LLM이 component 구조·읽기 채널·범위를 확인한 뒤 필요한 데이터를 선택해 읽는다.
grid/chart 종류만으로 전체 읽기 전략을 코드가 결정하지 않는다. 내부 상태·임의 함수는
읽지 않으며 reviewed adapter와 일반 DOM/text/허용된 vision을 사용한다.

## 구현 카드와 순서

| 카드 | 수정 영역과 산출물 | 종료 조건 |
| --- | --- | --- |
| S19-C1 | list_page_resources에 실제 component metadata/opaque ID 연결 | 처음 보는 component를 모델이 목록·UI 근거로 발견 |
| S19-C2 | describe_component function schema/executor | 관찰 종류의 근거, 구조·count·채널 availability·continuation·복구/side effect 반환 |
| S19-C3 | read_component_data의 채널별 typed schema와 기존 reader/adapter 연결 | LLM이 채널·범위를 선택. 실제 수집·masking·coverage·EOF/continuation 반환 |
| S19-C4 | Act의 screenshot/zoom을 기존 vision 권한·capture 계약으로 연결 | 실제 executor/정책이 지원할 때만 제공. 이미지로 실행 좌표/ref 생성 없음 |
| S19-C5 | bounded scroll/페이지 이동·펼침과 복구·승인 연결 | 읽기에 따르는 mutation도 기존 권한 적용. 중단·실패의 복구 결과 명시 |
| S19-C6 | table/grid/list/tree/chart/SVG/canvas/미분류 holdout 검증 | 구조·범위·시각 추정과 실제 데이터 구분. 알려진 fixture 의미 hardcoding 없음 |

재사용 대상은 component-descriptor.ts, component-facade.ts, collection-reader-registry.ts,
기존 analysis-data-acquisition/선택 흐름과 screenshot/zoom executor다. 채널별 인자는
oneOf 등 실제 지원 schema로 표현하고 미지원 인자를 임의 실행 코드로 전환하지 않는다.

## 검증 행렬

| ID | 시나리오 | 기대 결과 |
| --- | --- | --- |
| S19-R1 | static/virtual grid·pagination·미전개 tree | visible/logical/total count 구분, continuation·중복 제거·EOF 근거 |
| S19-R2 | chart와 보조 표 불일치·SVG/canvas 대체 자료 없음 | 불일치·미확인·시각 추정 한계를 모델에 전달. 실제 수치로 위장하지 않음 |
| S19-R3 | reviewed_data 부재·새 component | UNSUPPORTED와 일반 DOM/text/visual 대안 제공. 페이지 전체 제외 없음 |
| S19-R4 | 이미지/데이터의 민감값·vision 동의 거부 | egress/capture/export 검사. 안전한 처리 불가는 채널 지원 불가로 표시 |
| S19-R5 | scroll/이동·중단·문서 변경·stale cursor | 승인·복구·binding 유지. 복구 실패와 부분 수집을 기록 |
| S19-R6 | 전체 자료 요청과 제한된 읽기 | EOF/coverage 근거 없이 전체 완료 없음. 모델이 필요한 continuation 선택 |

## 완료 조건과 산출물

- 목록→descriptor→모델 채널 선택→실제 읽기→결과 반환→다음 판단이 연결된다.
- 화면 행 수와 전체 데이터 수, 이미지 추정과 underlying 데이터를 구분한다.
- 기존 Ask/collection/Page API read·권한·복구·마스킹 회귀를 확인한다.
- component별 계약/unit와 통제 Chrome/live Provider 선택 증거를 각각 기록한다.
- 지원 안 되는 채널을 capability·UI·결과에서 동일하게 표시한다.

다음 단계는 [S20](s20-act-tool-loop-live-qualification.md)이다.
