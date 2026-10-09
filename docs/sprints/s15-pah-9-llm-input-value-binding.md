# PAH-9 — LLM의 입력값 판단·자동 입력·추가 질문

상태: In Progress. 추가일: 2026-10-06. 의존성: PAH-3의 모델 continuation,
PAH-6의 승인·실행 연결. 기준: [상세 설계 9.1절](../34-page-act-context-harness-design.md#91-llm의-입력값-판단과-실행-결속).
2026-10-08: 구현·단위/계약·통제 Provider+Chrome 6건 및 실제 진단 ZIP 검증을 수행했다.
실제 Provider의 질문 도구 선택·continuation 종료·holdout 완료가 아직 일관되게 통과하지
않아 Completed는 보류한다. [최신 검증 기록](../evidence/s15-pah-9-closure-2026-10-08.md)과
[안전한 실행 요약](../evidence/s15-pah-9-validation-2026-10-08.json)을 참고한다.

## 목표

값 제공 여부, 대상과 값의 대응, 추가 질문 필요성을 LLM이 판단한다. 사용자가 이미
명확한 값을 제공했다면 기존 승인 후 해당 페이지 입력란에 자동 입력한다. value card는
값이 없거나 모호하여 LLM이 추가 입력을 요청한 경우에만 사용한다.

## 작업

- 최초/후속 모델 문맥에 원래 요청·관련 사용자 응답·최신 UI를 연결하고, 입력값과 대상의
  대응 또는 clarification을 LLM이 판단하도록 지침을 갱신한다. 키워드·정규식·fixture 이름으로
  값을 추출하거나 질문 여부를 결정하는 제품 코드 분기는 추가하지 않는다.
- `act-tools.ts`의 `propose_set_text`, `act-proposal-parser.ts`, harness plan/approval 계약에
  값과 사용자 request/clarification 출처 revision을 전달하는 내부 계약을 추가한다.
  tool schema·parser·실제 executor가 같은 계약을 사용하고 provider별 호환성을 검증한다.
- 명확한 값을 포함한 제안은 `act-proposal-readiness.ts`와 value slot/executor 경로에서
  승인된 제안에 결속한다. 요청에 값이 있어도 항상 value card로 빠지는 현행 경로를 전환한다.
- LLM의 clarification을 sidepanel value card로 표시하고 응답을 같은 conversation에
  반환한다. LLM의 새 입력 제안과 최신 대상·값을 승인·실행한다. 값 누락/schema 오류는
  모델에 반환하며 core가 질문 UI를 자동 결정하지 않는다.
- 검토·승인 UI에서 대상과 적용할 값을 확인할 수 있게 하고 변경된 제안은 기존 승인과
  구분한다. 계획 승인과 동작 승인의 적용 범위는 기존 permission/revision 규칙을 따른다.
- 값의 타입·길이·option enum과 요청/계획/document 결속, fresh ref, 민감 대상 차단을
  검증한다. typed verifier는 실제 DOM 값 일치를 로컬 확인하고 모델에는 결과를 전달한다.
- raw value의 영구 저장·trace/export 유출을 방지하고 Stop/navigation/worker restart 및
  사용자 정정 시 이전 값·질문 응답·승인의 재사용과 mutation 중복 실행을 차단한다.
- 기존 target-only 제안, value card 응답, approval store와 provider transport의 전환·실패
  처리를 명시한다. 공유 계약이 필요하면 기존 contract-first 절차를 적용한다.

## 완료 기준

- `Search query에 browser test를 입력해줘.`에서 LLM이 대상과 값을 제안하며, 승인 후
  `input#search`에 정확한 값이 들어간다. 추가 value card와 값 재입력 요구가 없다.
- `검색을 하고 싶어.`에서 문맥에 값이 없으면 LLM이 검색값을 질문한다. 응답 전 mutation이
  없고, value card 응답을 받은 모델의 제안·승인 후 실제 입력과 검증이 수행된다.
- 모호한 값/대상은 모델이 필요한 질문을 선택하며, 여러 필드·여러 값과 후속 정정도
  모델의 제안대로 대응된다. 코드가 업무 의미를 분류하거나 임의 기본값을 넣지 않는다.
- 값이 빠진 제안·잘못된 schema는 모델에 오류로 돌아가며 자동 value card나 추측 입력으로
  이어지지 않는다. 질문은 실제 모델의 clarification으로 확인된다.
- 대상·값·request revision이 바뀌거나 페이지가 변경되면 기존 승인·값을 재사용하지 않는다.
  취소·재시작·stale 응답·권한 거부에서 미승인/중복 mutation이 없다.
- password/OTP 차단과 option enum·값 길이·마스킹 검증이 유지된다. 진단에는 결속·판정
  정보와 verifier 결과가 있고 원본 값은 없다. Ask 읽기 전용 권한에 변화가 없다.

## 검증과 산출물

계약/unit 검증, 통제 Provider + 실제 Chrome의 승인·질문·응답 continuation·DOM 입력 증거,
live Provider + Chrome의 값 판단 증거를 각각 기록한다. holdout에서는 label·DOM·문구·
따옴표·여러 필드 구성을 바꾸고 case ID나 정해진 도구로 모델 판단을 대체하지 않는다.
지원 provider/model/build revision과 실제 실행 수·성공/실패·미검증 범위, 마스킹된 진단,
기존 입력 경로의 호환성 결과를 남긴다. 문서 추가만으로 이 Sprint를 Completed로 기록하지 않는다.

## 관련 문서

- [전체 PAH Sprint 계획](../sprint-page-act-context-harness-plan.md)
- [34번 상세 설계](../34-page-act-context-harness-design.md)
- [기존 PAH 구현 증거](../evidence/pah-implementation-record.md)
