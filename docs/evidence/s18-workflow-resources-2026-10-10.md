# S18 workflow 목록·원본·LLM 검토 — 2026-10-10

## 판정과 범위

**PASS — Completed, Browser-local S18.** 실제 Provider schema → executor → 원래 call ID의
결과 → 같은 대화의 후속 원본 읽기·검토 → 최신 binding 재확인 → 동작 승인·실행을 연결했다.
통제 Chrome 6/6과 실제 OpenAI `gpt-6-luna`의 세 출처 match/mismatch 6/6을 확인했다.
마지막 candidate ID/provenance 보강 후 Profile match·generated mismatch 2/2도 재실행했다.
운영 사이트, 임의 모델, Platform/MCP discovery, S19/S20 종합 검증과 배포는 이 판정에 포함하지 않는다.

기준 HEAD는 `63e9b804b85588e966919086a57ee0e4eaa4c8a6`, S18 변경은 작업 트리에 있다.
확장 버전 `0.1.98`, Chrome for Testing `147.0.7727.15`, synthetic HTTPS fixture를 사용했다.
[마스킹된 실행 요약](s18-workflow-resources-2026-10-10.json)은 호출 도구·opaque call ID·HTTP 상태·
verdict·coverage·승인 수·DOM 변경 boolean·ZIP 마스킹·원시 보고서 SHA-256만 보관한다.
키, 원문 Provider 답변, tool 인자, 페이지 원문과 실제 입력값은 저장소 증거에 넣지 않았다.

## 구현과 승인 경계

- C1/C2: `workflow-resource-{schemas,store,tools,read}.ts`가 세 출처의 metadata pagination과
  원본 JSON의 masked UTF-8 chunk/continuation을 제공한다. source filter의 coverage는 해당 범위다.
  기존 v1의 tool/target/condition/expected/branch/next를 보존하며 미지원 입력 필드를 추가하지 않는다.
- C3: 선택 후보의 단계 요약으로 match를 대신하지 않는다. 모델이 실제 목록과 원본을 읽고
  `submit_review`를 반환한다. 원본 ID/revision/cursor는 request-local이고 원본 hash는 내부에서만 쓴다.
- C4: 선택한 candidate ID의 전체 읽기, 최신 원본/provenance, request/document/origin/path/현재 UI를
  재확인한다. partial/mismatch/needs_context·마스킹으로 의미 손실·취소·변경 원본에서는 실행하지 않는다.
  기존 계획/동작 승인을 유지하며 부적합 선택은 설명·질문으로 종료한다. 자동 plan delta 생성은 하지 않는다.
- C5: saved v1 저장, 서명 검증된 Profile, page-generated, request-local 코드 분석 초안을 유지한다.
  원본·초안·실행 계획을 구분하며 변경 초안을 Profile에 설치하거나 원본을 덮어쓰지 않는다.
  일반 workflow 회귀의 선언은 테스트에서만 삽입하며 삭제된 examples 선언을 복원하지 않는다.

## 최종 검증

| 검사 | 결과 |
| --- | --- |
| TypeScript, ESLint/Prettier, module boundaries, method trace | PASS |
| `pnpm exec vitest run` | 145 files / 684 tests PASS, unit·fixture·e2e |
| 버전 보존 compile/bundle/package validation | PASS, 0.1.98 유지 |
| S18 통제 Chrome | saved/Profile/page_generated × match/mismatch 6/6 PASS |
| S18 OpenAI live | 세 출처 6/6 PASS; 최종 보강 코드 2/2 PASS |
| S15 / S17 통제 Chrome 회귀 | 6/6 및 8/8 PASS |
| 기존 다단계 workflow | 원본 읽기·리뷰 → scope → checkbox → Preview, 3개 승인 PASS |
| S14 | verified/stale/incomparable, 선택·시작 직전 stale 차단 PASS |
| source-size | 기존 초과 파일 80개로 FAIL; 신규 production 모듈 4개는 각각 200줄 미만 |

match 세 사례는 실제 목록·전체 원본 → match → 동작 승인 1회 → Preview DOM 변경 →
`VERIFIED` → 최신 관찰 기반 goal completed로 끝났다. mismatch 세 사례는 실제 원본 → mismatch,
동작 승인 0회, 페이지 불변이었다. 모든 최종 사례는 읽기 call ID의 후속 결과 반환과 ZIP 마스킹을 확인했다.
통제 사례는 page_size 1과 max_bytes 256으로 목록 pagination 및 원본 continuation도 실행했다.

계약 테스트는 같은 제목의 다른 branch/expected, UTF-8 경계, 선택 후보 ID 결속, Profile provenance 변경,
원본 변경·취소·잘못된 cursor·unknown ID·민감 대상·마스킹 후 불완전 원본을 검사한다.
partial/needs_context와 stale 선택의 승인 미소비·무실행은 기존 review gate 테스트로 확인했다.
세 출처 각각의 partial/needs_context live 행렬과 임의 지시문 공격의 live 일반화는 별도다.

## 실패와 재실행

1. 첫 OpenRouter saved match는 HTTP 200, 읽기·match·승인·실행·목표 완료까지 진행했지만 테스트가
   source filter를 허용하지 않고 모든 출처를 요구해 FAIL이었다. 선택 출처 discovery 검사로 수정했다.
2. 다음 OpenRouter 실행은 기록된 5개 중 saved match가 FAIL, 나머지 4개 PASS였다.
   saved match는 원본 읽기와 match 이후 도구 제안 대신 reasoning text로 종료해 승인·실행이 없었다.
   실행을 강제하지 않았으며 generated mismatch가 기록되기 전에 실행을 중단했다. 전체 PASS로 바꾸지 않는다.
3. 최초 OpenAI 실행에서는 ready인 실제 controls와 충돌하는 fixture 안내문 때문에 모델이 partial로
   판단했고 페이지를 변경하지 않았다. 실행을 중단하고 테스트 안내문을 실제 ready 상태에 맞춘 뒤 6/6을 통과했다.
4. 최종 통제 검사의 강화된 goal assertion은 double report의 goalStatus 누락으로 match 3개가 FAIL이었다.
   실제 DOM 실행은 성공했으며 기록 로직을 고친 후 같은 6개를 모두 재실행해 PASS했다.

5. 별도 다단계 호환성 fixture에 next 연결을 누락해 v1 reachability 검증이 거부했다.
   선택·승인·실행 없이 종료했으며 fixture를 유효한 연결로 수정해 재실행했다.

6. 유효한 다단계 원본의 읽기·리뷰 이후 과거 double의 option 제안에 value_source_revision이 없어
   승인 전에 거부됐다. double이 현재 execution inventory의 revision을 전달하도록 수정했다.
   실제 모델 응답과 제품의 입력값 검증 계약은 변경하지 않았다. 최종 다단계 회귀는 PASS다.

OpenRouter는 이 실행에서 HTTP 429가 아니라 모델의 도구 미제안으로 실패했다.
사용자가 허용한 OpenAI 대체 경로를 별도로 검증했다. 강제 tool choice, 모델 인자/판단 수정,
실패 응답을 성공으로 바꾸는 처리는 사용하지 않았다.
실행 명령·모델·환경 변수 이름은 [테스트 가이드](../test.md#s18-workflow-목록원본검토-테스트)를 따른다.
