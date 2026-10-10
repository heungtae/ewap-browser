# 현재 페이지 문맥 수집과 Act Harness Sprint 계획

- 작성일: 2026-10-04
- 계획 추가: 2026-10-06. LLM 판단에 따른 입력값 자동 결속·추가 질문을 PAH-9로 등록.
- 후속 단계 추가: 2026-10-06. 34번 설계 16절의 도구 연결 완성을 Browser Act S16~S20으로 등록.
- 상태: PAH-9 Completed (Browser-local, 지정 fixture·OpenAI 모델). [2026-10-09 수정·live 검증](evidence/s15-live-fix-2026-10-09.md). PAH-0~8의 표·절별 상태는 최초 계획 기록이며, 이후 실행 증거는
  [구현 기록](evidence/pah-implementation-record.md)과 후속 검증 문서에서 확인한다.
- 기준: [상세 설계](34-page-act-context-harness-design.md)
- 문서 동기화 승인 전 목록: [기존 문서 검토](page-act-context-harness-document-sync-review.md)
- 소유 저장소: `ewap-browser`. 외부 계약 변경이 필요할 때만 workspace/Platform 별도 작업을 만든다.

## 1. 운영 원칙

기존 S0~S14 관리 문서와 구분하기 위해 이 계획은 `PAH-0`~`PAH-9`를 사용한다.
PAH는 Page Act Harness 작업의 식별자이며 기존 Sprint의 완료 기록을 다시 쓰지 않는다.
S15 파일명의 PAH-9 다음 개발 단계는 Browser Act S16~S20을 사용한다.
이는 기존 Enterprise 배포 S15와 다른 Browser-local Act 후속 범위다.
날짜·기간·story point는 정하지 않는다. 코드와 provider 호환성 조사 후 별도 추정한다.

최초 작성 범위는 신규 설계·Sprint 문서·동기화 검토 목록이었다. 이후 입력값 처리
설계와 PAH-9를 추가했고, 이번에는 도구 연결 설계 구체화와 S16~S20 개발 계획을 추가한다.
현재 작업 트리의 PAH-9 코드 존재를 완료 증거로 간주하지 않는다. 기존 구현 증거는 유지하고
2026-10-08 사용자 요청으로 S16을 구현했다. 검증 상태는 [S16 증거](evidence/s16-script-tool-loop-2026-10-08.md)와
[10월 9일 live 실패 수정·완료 증거](evidence/s16-live-tool-loop-fix-2026-10-09.md)를 따른다.
S16은 Browser-local Completed이며 S17은 [OpenAI live 증거](evidence/s17-live-openai-luna-2026-10-09.md) 기준 Browser-local Completed이며 S18은 [원본 조회·live 검증 증거](evidence/s18-workflow-resources-2026-10-10.md) 기준 Browser-local Completed이며 S19/S20은 Planned다.

각 Sprint는 작은 end-to-end 경로를 먼저 증명한 뒤 범위를 넓힌다. 현재 permission,
credential 차단, document binding, opaque ref, typed verifier를 유지한다.
페이지 이름·요청 문구·fixture 함수·component 종류로 업무 실행을 고르는 구현은 하지 않는다.
WebMCP 구현·실험 예제는 이 계획에 포함하지 않는다.

## 2. Sprint 전체 목록

| Sprint | 산출 행동 | 의존성 | 현재 상태 |
| --- | --- | --- | --- |
| PAH-0 | 현재 경로 재현과 내부 계약·호환성 경계 확정 | 사용자 설계 확인 및 구현 착수 요청 | Planned |
| PAH-1 | 처음 보는 일반 페이지의 최초 context와 추가 UI/설명 읽기 | PAH-0 | Planned |
| PAH-2 | 자료 inventory·스크립트 발견·동의·부분 읽기 | PAH-1 | Planned |
| PAH-3 | provider의 read→tool result→추가 read→plan 루프 | PAH-1, PAH-2 | Planned |
| PAH-4 | component 구조·가용 채널·coverage를 모델에 제공 | PAH-3 | Planned |
| PAH-5 | 세 workflow 출처의 LLM 검토와 일반 example 전환 | PAH-3. component 의존 시 PAH-4 | Planned |
| PAH-6 | 계획 승인→실행→관찰→동작/목표 검증 연결 | PAH-5 | Planned |
| PAH-7 | Stop·재시작·문맥 압축·budget·전체 진단 보강 | PAH-6. 기본 취소/마스킹은 앞 Sprint부터 적용 | Planned |
| PAH-8 | holdout·실제 LLM·Chrome 검증과 호환성·배포 준비 | PAH-4, PAH-7 | Planned |
| PAH-9 | LLM이 입력값·대상·질문 필요성을 판단하고 제공된 값은 승인 후 자동 입력 | PAH-3의 모델 continuation, PAH-6의 승인·실행 연결 | Completed (Browser-local, 지정 fixture·OpenAI 모델) |

워크플로우 세 출처의 적합성 검토를 먼저 고정한 뒤 읽기 도구를 뒤늦게 붙이지 않는다.
PAH-1~3에서 모델이 필요한 근거를 구하는 능력을 먼저 만든다.
PAH-4는 데이터 읽기가 필요한 계획의 공통 기반이며 단순 입력 계획의 전제는 아니다.

### 2.1 실제 도구 연결을 완성하는 후속 단계

이전 PAH 모듈·unit slice의 증거와 아래 최초 요청의 end-to-end 연결 완료를 구분한다.
각 단계는 schema→모델 호출→executor→동일 대화 결과 반환→다음 판단을 입증한다.

| 순서 | Sprint 상세 | 산출 행동 | 진입 조건 | 상태 |
| --- | --- | --- | --- | --- |
| 선행 | [S15 / PAH-9](sprints/s15-pah-9-llm-input-value-binding.md) | LLM의 입력값·추가 질문 판단 | 기존 모델 continuation·승인 연결 | 기존 계획 상태·실행 증거로 추적 |
| 1 | [S16](sprints/s16-page-script-tool-loop.md) | registry와 script 발견·검색·부분 읽기·동의 | 현재 UI read loop/request binding | Completed — Browser-local |
| 2 | [S17](sprints/s17-act-plan-execution-feedback.md) | 계획·실행 수단 metadata·관찰·목표 판단 | S16, S15 입력값 계약 | Completed — Browser-local |
| 3 | [S18](sprints/s18-workflow-resource-tools.md) | 후보 목록·원본 읽기·세 출처 검토 | S16, S17 | Completed — Browser-local |
| 4 | [S19](sprints/s19-component-data-tools.md) | component descriptor·채널별 데이터·Act vision | 순차 S18 이후, 기술 의존 S16/S17 | Planned |
| 5 | [S20](sprints/s20-act-tool-loop-live-qualification.md) | 전체 경로 holdout/live·호환성·fault 검증 | S15~S19 연결 기능과 단계별 증거 | Planned |

각 단계에서 실제 Chrome과 필요한 live 모델 판단을 확인한다. S20은 앞 단계의 live
검증을 생략하는 이유가 아니라 전체 요청·오류·호환성의 종합 검증이다.

## 3. 모든 Sprint의 공통 완료 조건

각 Sprint는 다음을 충족해야 Completed로 옮길 수 있다.

1. 구현한 행동과 미지원 행동을 내부 capability·UI·문서에서 동일하게 표시한다.
2. 요청·document·resource·plan revision과 취소 처리가 새 경로에 연결돼 있다.
3. 새/변경 method의 debug·trace 진입·반환·오류·취소 및 masking metadata가 확인된다.
4. 변경 위험에 맞는 계약/unit 검증과 실제 Chrome 경로를 실행한다. 모델 추론 검증이
   필요한 Sprint는 live Provider 증거를 추가하며, 미실행이면 해당 범위는 미검증이다.
5. 실행 결과의 실제 전후 상태·tool trace·coverage를 보존한다. 통제 응답과 실제 모델을 구분한다.
6. 기존 outcome·local storage·provider·Ask/Act 권한 회귀를 확인한다. 관련 외부 계약이
   변경됐다면 contract→제품별 테스트→통합→backward compatibility를 별도 수행한다.
7. 문서 동기화가 승인된 경우에만 해당 Sprint의 기존 문서를 갱신하고, 과거 증거는 보존한다.

기본 마스킹·결속·timeout은 PAH-7까지 미뤄 두는 기능이 아니다. PAH-7은 여러 단계와
재시작·압축을 가로지르는 회복·진단의 종합 검증을 담당한다.
실패 케이스를 expected success로 바꾸거나 다른 경로로 자동 우회하여 완료하지 않는다.

## 4. PAH-0 — 현재 경로와 내부 계약 확정

상태: Planned. 실행 없이 설계 작성 중 확인한 source inventory만 존재한다.

### 목표

실패 경로와 성공 주장 범위를 고정하고, Browser 내부 변경과 공유 계약 변경을 나눈다.

### 작업

- Search 입력 요청에서 Preview 선택·미선택 경로를 각각 Chrome으로 재현한다.
- 현행 Provider 입력, workflow 선택 상태, offered tools, tool 호출, 실제 입력 여부,
  answer/action outcome을 같은 request ID로 수집한다.
- bootstrap/evidence/resource/cursor/plan/review 내부 계약과 versioning을 확정한다.
- 기존 Ask read runner·Act executor의 재사용 지점을 정하고 provider tool round-trip을 확인한다.
- 현재 local catalog·selection session·diagnostic/export 소비자에 대한 migration 표를 작성한다.
- workspace workflow/PageProfile와 Platform resource 계약의 producer/consumer를 확인한다.
  외부 변경이 없으면 그 이유를 기록하고, 필요하면 별도 contract-first 작업을 만든다.
- 기존 문서의 AS-IS/TO-BE/역사 기록을 구분한다. 승인 전에는 목록만 유지한다.

### 완료 기준

- Preview 선택 상태에서 입력 도구가 누락되는 원인과 경로가 실제 trace에 연결된다.
- 최초 context의 필수 필드, 실행 가능한 read tool schema, 오류·coverage 계약이 결정된다.
- 원본 요청을 유지하는 revision 규칙과 의미 판정/실행 권한 책임이 합의된다.
- 새 outcome을 외부 enum에 무단 추가하지 않는 migration 방식이 기록된다.

### 검증과 산출물

격리 Chrome 재현 보고서, 안전한 provider payload 예, 내부 계약·compatibility 표.
진단 ZIP은 민감값 검사 후 안전한 요약만 저장한다. 기존 36/36을 새 경로의 baseline
성공으로 취급하지 않는다. 제품 기본 동작 변경은 이 Sprint의 목표가 아니다.

## 5. PAH-1 — 최초 문맥과 일반 페이지 읽기

상태: Planned. 의존성: PAH-0.

### 목표

첫 LLM 요청이 현재 페이지를 이해하고 추가 UI/설명 읽기를 시작할 수 있게 한다.

### 작업

- request/history/operating instructions/binding/UI summary/visible description/coverage를 구성한다.
- 실제 tool schema와 capability metadata의 일치를 검사한다.
- 기존 `read_page`, `get_page_text`, `find`, `read_semantic_projection`의 Act 연결을 구현한다.
- read infrastructure를 공유하되 Ask에는 mutation 제안 도구를 넣지 않는다.
- 설명 텍스트가 interactive projection 밖에 있을 때 추가 읽기로 가져오게 한다.
- synopsis 제한·omitted 상태·cursor의 연결과 fresh ref 재관찰을 구현한다.

### 완료 기준

- 전용 HTML 선언이 없는 일반 페이지에서 요청 원문·section·control·읽기 방법이 최초 payload에 있다.
- 초기 summary에 없는 도움말을 추가 tool 호출로 읽고 동일 요청의 결과로 반환한다.
- 현재 읽지 않은 자료, 없는 자료, 미지원 자료가 서로 다른 상태로 보인다.
- hidden/disabled/password 노드를 읽기 근거·실행 target 권한과 혼동하지 않는다.

### 검증과 산출물

bootstrap/egress 계약 검증, 실제 Chrome의 일반 페이지 추가 읽기 보고서,
Ask read-only 회귀. 통제 Provider 검증은 전달·읽기 계약 증거이며 LLM 관련성 판단
완료로 표기하지 않는다. end-to-end 자동 계획은 PAH-3에서 이어 연결한다.

## 6. PAH-2 — 문서·스크립트 inventory와 부분 읽기

상태: Planned. 의존성: PAH-1.

### 목표

모델이 resource ID를 모르는 상태에서도 자료를 발견하고 필요한 부분을 읽을 수 있게 한다.

### 작업

- `list_page_resources`, `read_page_resource`, `search_page_resources`의 executor를 구현한다.
- 일반 설명 section, inline/external script metadata, 연결된 허용 문서의 inventory를 구성한다.
- 자료가 많은 경우 목록 pagination과 source chunk cursor를 제공한다.
- source 전달 동의, host 검사, credential 없는 제한 fetch, 마스킹·egress 검사를 연결한다.
- resource revision 변화·거부·읽기 불가·크기 제한 결과를 typed status로 반환한다.
- 기존 Page API Discovery의 비공개 candidate를 재사용해 모델에 노출하지 않는지 검증한다.
- 정적 event/function 힌트는 일반 구조로 구현하고 특정 example 함수명을 넣지 않는다.

### 완료 기준

- 파일명·resource ID를 모델이 모르더라도 inventory부터 시작해 필요한 source chunk를 읽는다.
- script 수/크기 제한을 넘으면 남은 자료와 continuation이 보이며 전체 검토 완료로 표시하지 않는다.
- 동의 전 본문이 provider로 나가지 않는다. 동의 거부는 빈 source 성공이 아니다.
- 읽은 코드로 arbitrary JS/endpoint 호출 도구가 생기지 않는다.
- 원문 source/credential이 transcript·diagnostics·export에 없고 masking 정보는 남는다.

### 검증과 산출물

작은 inline·큰 external·credential-like·읽기 불가·source 변경·pagination fixture의
계약 및 Chrome 증거. source 접근 정책과 마스킹 false negative 위험을 별도 기록한다.
source map/private closure 복원은 이번 구현 범위에 넣지 않는다.

## 7. PAH-3 — LLM의 반복 읽기와 계획 생성

상태: Planned. 의존성: PAH-1, PAH-2.

### 목표

정보가 부족한 모델이 발견·읽기를 요청하고 결과를 받은 후 다시 판단하는 실제 loop를 만든다.

### 작업

- 부족하면 추가 읽기, ID가 없으면 inventory, partial이면 continuation을 요청하는 prompt를 적용한다.
- provider의 tool call/result/continuation을 request/turn/evidence ID에 결속한다.
- read 요청·clarification·계획 제안·final response를 실제 응답으로 해석한다.
- 복수 독립 읽기와 의존 읽기의 처리, schema 오류·미지원 도구·중복 ID를 구현한다.
- `submit_plan`의 목표·근거·coverage·입력·부작용·postcondition 계약을 연결한다.
- 필요한 source를 읽지 못한 판단은 `needs_context`로 남긴다.
- 계획/읽기 limit을 노출하고 budget 소진을 incomplete로 처리한다.

### 완료 기준

- 실제 전달된 도구를 이용해 inventory→read→tool result→추가 read→계획이 이어진다.
- 모델이 아직 읽지 않은 자료로 완료 주장하면 테스트에서 실패가 검출된다.
- unknown/denied/unsupported에 대해 모델이 대안 또는 질문을 제시하고 성공으로 오인하지 않는다.
- 입력 목표가 Preview 단계로 자동 바뀌지 않는다. 요청 변경은 실제 사용자 응답이 필요하다.
- 서로 다른 provider transport가 tool result를 처리할 수 있는지 지원 범위를 기록한다.

### 검증과 산출물

통제 Provider는 round-trip·실패 처리 검증에 사용한다. 실제 선택 능력은 별도 live
Provider + Chrome에서 검증한다. 미제공 정보가 필요한 일반 페이지와 명확한 단일 입력
페이지를 함께 사용해 불필요한 읽기 반복과 필요한 읽기 누락을 모두 측정한다.
live 환경이 없으면 해당 완료 기준은 미검증으로 남긴다.

## 8. PAH-4 — Component 데이터 관찰과 선택 가능한 읽기

상태: Planned. 의존성: PAH-3.

### 목표

grid/chart/list/SVG 등에서 모델이 자료 구조·한계를 빠르게 파악하고 읽기 채널을 선택하게 한다.

### 작업

- descriptor에 observed kind, channels, count/coverage/EOF/continuation/restoration을 포함한다.
- 기존 collection reader·reviewed read-only adapter를 generic facade에 연결한다.
- 문구로 collection 종류를 미리 확정하는 경로를 capability discovery와 모델 선택으로 전환한다.
- 지원하지 않는 component도 일반 DOM/text/visual 관찰로 유지한다.
- virtual grid, pagination, chart 대체 표, SVG 설명과 이미지의 관찰 근거를 구분한다.
- scrolling/expansion/pagination의 side effect·권한·복구를 표시한다.

### 완료 기준

- core가 grid/chart라는 이름만으로 사용자 범위·읽기 전략을 확정하지 않는다.
- visible/logical/supplied/total count와 전체 미확인이 provider와 UI에 전달된다.
- EOF 없는 pagination과 viewport만 읽은 grid를 complete로 표시하지 않는다.
- chart 보조 표가 없거나 불일치하면 실제 값 확보 실패·시각 추정 한계를 표시한다.
- 미분류 component가 포함돼도 다른 가용 자료의 읽기·계획을 차단하지 않는다.

### 검증과 산출물

virtual/mixed/paginated/chart/SVG/미분류 holdout의 Chrome trace와 scroll 복구 evidence.
통제 Provider 경로와 실제 모델의 채널 선택을 분리해 보고한다. 직접 API 호출·무제한
스크롤을 지원 범위 확대의 대체 수단으로 사용하지 않는다.

## 9. PAH-5 — 세 workflow 출처의 검토와 예제 전환

상태: Planned. 의존성: PAH-3. component 데이터가 필요한 시나리오는 PAH-4 이후.

### 목표

saved/Profile/page-generated 모두 현재 페이지·필요한 코드·요청으로 모델 검토를 거친다.
페이지 절차는 page-generated의 입력 자료로 통합한다.

### 작업

- workflow inventory/원본 읽기/검토 결과/출처·provenance를 연결한다.
- match/partial/mismatch/needs_context와 기술적 실행 불가를 구분한다.
- 후보 선택 뒤 최신 evidence로 재검토하고 무관 선택의 목표 변경·새 계획·질문 UI를 구현한다.
- 후보 제목·서명·출처 순서·키워드로 core가 적합성을 확정하는 분기를 제거한다.
- 원본과 변경 초안, 서명된 정의와 승인되지 않은 새 초안을 분리한다.
- 일반 accessible example의 전용 workflow JSON을 제거하고 보이는 설명·실제 handler로 전환한다.
- 기존 선언 의존 요청·테스트를 새 발견·검토·계획 경로로 함께 이전한다.
- legacy가 필요하면 일반 example과 구분된 compatibility fixture로 유지한다.

### 완료 기준

- 세 출처 각각 적합/부분/무관/자료 부족이 실제 검토 입력·출력에 연결된다.
- Search 입력 요청에서 Preview를 사용자가 선택해도 scope 단계를 즉시 실행하지 않는다.
- 일반 경로를 테스트가 미리 선택하지 않아도 요청에 맞는 입력 계획을 제시한다.
- 전용 JSON 없는 Preview 요청도 설명·코드를 읽고 계획을 만든다.
- 원본 workflow가 삭제·축소·수정되지 않고 변경 초안의 delta와 새 승인 경계가 보인다.

### 검증과 산출물

실제 Chrome의 세 출처·무관 선택·상태 변경, live Provider 적합성 검토 증거.
saved와 Profile fixture의 출처·무결성을 모델 추론 결과와 구분한다.
외부 Profile schema가 달라지면 이 Sprint를 Browser-local PASS로 닫지 않고 공유 계약
및 Platform 작업을 선행한다. 기존 36개 요청의 변동은 사용자 확인 후 문서화한다.

## 10. PAH-6 — 승인·실행·관찰·목표 완료

상태: Planned. 의존성: PAH-5.

### 목표

읽기와 계획이 실제 동작으로 이어지고 설명 완료가 조작 성공으로 표시되지 않게 한다.

### 작업

- plan/request revision과 action approval을 결속하고 승인 뒤 최신 preflight를 수행한다.
- permission, executor, typed postcondition verifier를 연결한다. 값 입력 card의 조건과
  요청에서 제공한 값의 자동 결속은 PAH-9의 변경 계약을 따른다.
- 실행 뒤 observation을 evidence로 반환하고 모델이 다음 단계/재계획/최종 목표를 점검하게 한다.
- answer-only, action verified, goal verified, failed, unknown, incomplete를 내부 결과에서 분리한다.
- 기존 export/storage enum 소비자와 호환 transition을 구현한다.
- 실패한 verifier·미관찰 결과를 모델 답변으로 성공 처리하지 않는다.
- unsupported step 삭제·workflow subset 성공·미승인 목표 변경을 방지한다.

### 완료 기준

- Search 입력은 실제 input 상태의 로컬 검증으로 성공 여부를 판단한다. raw value는 로그에 없다.
- Preview 완료는 필요한 단계 검증과 최종 UI observation이 있어야 목표 완료가 된다.
- tool call 없는 답변과 읽기만 수행한 요청은 mutation verified가 아니다.
- 단계 검증 성공이 전체 요청 성공으로 자동 승격되지 않는다.
- 승인 이후 페이지가 바뀌면 기존 target/ref/승인으로 새로운 동작을 실행하지 않는다.

### 검증과 산출물

Chrome의 입력·다단계·비동기·실패·answer-only·중간 변화 증거와 outcome migration 회귀.
provider 관찰 설명과 typed verifier의 판정을 함께 보고한다. 입력값 처리의 변경 개발은
PAH-9로 추적하며, 기존 card 경로의 PASS를 새 자동 결속 동작의 증거로 사용하지 않는다.

## 10.1 PAH-9 — LLM의 입력값 판단·자동 입력·추가 질문

상태: Completed (Browser-local, 지정 fixture·OpenAI 모델). [2026-10-09 수정·검증](evidence/s15-live-fix-2026-10-09.md). 추가일: 2026-10-06. 의존성: PAH-3의 모델 continuation,
PAH-6의 승인·실행 연결.

값 제공 여부·대상과 값의 대응·추가 질문 필요성은 LLM이 판단한다. 명확한 값은
기존 승인 후 자동 입력하고, 없거나 모호한 경우에만 value card로 추가 입력을 요청한다.
작업 범위·완료 기준·검증 계획은 [PAH-9 Sprint 상세](sprints/s15-pah-9-llm-input-value-binding.md)에 기록한다.

## 11. PAH-7 — 복구·budget·문맥 압축·진단

상태: Planned. 의존성: PAH-6.

### 목표

긴 읽기와 여러 계획 revision에서도 안전하게 중단·재개하며 원인을 trace만으로 확인하게 한다.

### 작업

- Stop/navigation/provider timeout/worker restart를 모든 상태에서 검증한다.
- context compaction에 목표·revision·coverage·승인·미실행 단계·evidence/cursor를 보존한다.
- 자료/turn/time budget과 전달량을 표시하고 재개 가능한 읽기와 unknown action을 구분한다.
- 안전한 read 상태 복구와 최신 bootstrap을 연결하고 mutation 자동 재전송을 금지한다.
- 신규/변경 method 전체의 debug·trace 누락과 correlation, masking metadata를 검사한다.
- 진단 retention/dropped events/source 비저장/민감 image 처리 한계를 검증한다.

### 완료 기준

- worker 재시작 뒤 실행 여부가 미확인인 action을 중복 실행하지 않는다.
- 압축 이후 부분 coverage·denied·미승인 계획이 완전한 사실·승인으로 변하지 않는다.
- budget 종료가 성공으로 표시되지 않고 수집 범위·미실행 단계·계속 방법이 보인다.
- 실패한 요청의 bootstrap→offered tools→tool calls→review→dispatch→verify→terminal이 연결된다.
- 민감 원문 없이도 missing tool, stale, denied, unsupported, no call, failed verify를 구분한다.

### 검증과 산출물

상태별 fault injection, 여러 번의 source 읽기·계획 수정·worker restart Chrome 보고서,
마스킹된 진단 ZIP schema/누락 검사. 단순히 trace level을 설정했다는 사실로 완료하지 않는다.

## 12. PAH-8 — 범용성·live Provider·호환성과 배포 준비

상태: Planned. 의존성: PAH-4, PAH-7.

### 목표

예제에 알려진 정답 대신 새로운 페이지와 실제 모델로 행동을 검증하고 전환 조건을 정한다.

### 작업

- 이름/label/DOM/스크립트 위치/component 조합을 바꾼 holdout 페이지를 준비한다.
- request case ID·정해진 도구·일반 경로 자동 선택 없이 live Provider Chrome 테스트를 수행한다.
- 모델/provider/prompt/build revision과 반복 횟수·실패·추가 읽기·latency를 기록한다.
- 기존 Ask/Act/권한/기록/선택 session/diagnostic 호환성과 old storage 읽기를 검증한다.
- 관련 공유 계약이 바뀌었다면 workspace 검증, Browser/Platform 테스트, 통합·migration을 수행한다.
- 승인된 문서만 현재 구현·예제·검증 기록·인덱스에 동기화한다.
- build와 실제 로딩 artifact revision을 확인하고 opt-in 해제·rollback 조건을 결정한다.

### 완료 기준

- 각 필수 시나리오의 전체 실행 수·성공/실패·미검증 범위가 보고된다.
- 미사용 페이지를 읽고 실행한 근거가 있으며 페이지별 제품 코드가 추가되지 않았다.
- live 테스트 실패를 통제 Provider PASS로 대체하지 않는다.
- Platform/통합 검증이 적용되는지와 수행 여부가 명시돼 있다.
- 빌드 성공, Chrome runtime 성공, live reasoning 성공, 출시/배포 완료를 별개로 보고한다.

### 검증과 산출물

최종 matrix, 실제 Chrome/live Provider evidence, backward compatibility/rollback 문서,
현재 artifact의 build 기록. 실제 배포·commit/push는 해당 시점의 사용자 요청 범위에
맞춰 진행한다. 이 계획 문서 작성은 제품 배포 또는 Sprint 완료를 의미하지 않는다.

## 13. 최종 검증 matrix

| 시나리오 | 주요 Sprint | 통제 계약/Chrome | live Provider | 판정 근거 |
| --- | --- | --- | --- | --- |
| 초기 summary 밖 설명 | 1, 3 | 필수 | 필수 | 추가 read 요청과 동일 turn continuation |
| script ID 미상·부분 읽기 | 2, 3 | 필수 | 필수 | inventory→read→coverage→계획 |
| source 동의 거부·민감 문자열 | 2, 7 | 필수 | 가능한 안전한 fixture | egress/export 검사와 masking 정보 |
| grid/chart/list/SVG/미분류 | 4, 8 | 필수 | 필수 | 선택 채널·coverage·복구·실제 데이터 |
| 세 출처 match/partial/mismatch | 5 | 필수 | 필수 | 검토 evidence·원본 차이·요청 revision |
| Search 요청에 Preview 선택 | 5, 6 | 필수 | 필수 | 목표 유지·재검토·미승인 scope mutation 없음 |
| 명확한 값 제공·추가 입력 불필요 | 9 | 필수 | 필수 | LLM의 대상/값 제안→승인→value card 없이 실제 DOM 입력 |
| 값 미제공·모호성·여러 값·정정 | 9 | 필수 | 필수 | LLM 질문 판단→value card 응답→모델 continuation→새 제안·승인 |
| 값 계약 오류·stale·민감 대상·마스킹 | 9 | 필수 | 안전한 fixture | 오류 반환·이전 승인/값 재사용 없음·원문 비저장 |
| 전용 선언 없는 Preview | 5, 6 | 필수 | 필수 | 설명/코드 근거·승인·최종 화면 |
| 도구 없는 설명 | 6 | 필수 | 필수 | answer-only와 action/goal 분리 |
| stale/Stop/restart/timeout | 6, 7 | 필수 | 오류 fixture와 분리 | mutation 중복 없음·unknown 보존 |
| 큰 문맥·budget·압축 | 3, 7 | 필수 | 필수 | 부분 범위·미실행·재개 정보 보존 |
| storage/provider/Ask 회귀 | 0, 8 | 필수 | 지원 provider별 | 과거 데이터와 mode별 권한 |
| 공유 계약·Platform 연동 | 외부 변경 Sprint, 8 | 조건부 필수 | 대체 불가 | producer/consumer·apiVersion/migration |

## 14. 증거 기록 양식

Sprint별 종료 기록에는 아래 항목을 실제 실행 결과로 작성한다.

```text
Sprint / 상태 / 구현 revision:
변경 행동과 남은 제한:
내부·외부 계약 및 migration:
테스트 명령 / Chrome·provider·model / artifact revision:
통제 Provider 결과:
live Provider 결과와 전체 실행 수·실패:
실제 UI 전후 상태 / 안전한 trace·masking / coverage:
Browser / Platform / workspace·통합 수행 여부와 이유:
업데이트한 문서와 사용자 확인 범위:
다음 Sprint의 진입 조건:
```

이 계획의 최초 작성 상태는 `PAH-0~8: Planned`이며, 이후 구현·검증 증거는
[구현 기록](evidence/pah-implementation-record.md)과 후속 검증 문서에서 확인한다.
2026-10-06에 추가한 `PAH-9`는 최초 Planned였다. 2026-10-09의 별도 구현·live 증거로
Browser-local 범위에서 완료했으며 기존 PAH-0~8의 증거로 완료 처리한 것은 아니다.
후속 Browser Act S16~S20의 최초 등록 상태도 Planned였다. 현재 S16은 Browser-local Completed이며
[2026-10-09 실패 수정·검증](evidence/s16-live-tool-loop-fix-2026-10-09.md)을 따른다.
S17은 [OpenAI live 증거](evidence/s17-live-openai-luna-2026-10-09.md) 기준 Browser-local Completed이며 S18은 [원본 조회·live 검증 증거](evidence/s18-workflow-resources-2026-10-10.md) 기준 Browser-local Completed이며 S19/S20은 Planned다. 단계별 문서는 docs/sprints에 저장하며
설계·Markdown 검사를 실제 tool 연결이나 live 실행 증거로 사용하지 않는다.
과거 build·unit·Chrome 결과와 이번 설계 문서의 Markdown 검사를 신규 Sprint 구현 증거로
채우지 않는다. 기존 문서의 동기화 목록은
사용자 확인 전까지 검토 목록으로만 유지한다.
