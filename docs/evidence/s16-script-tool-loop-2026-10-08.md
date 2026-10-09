# S16 페이지 script 도구 구현·검증 — 2026-10-08

초기 구현·실행 기록이다. 최신 상태는 [10월 9일 live 실패 수정·재검증](s16-live-tool-loop-fix-2026-10-09.md)을 따른다.

## 판정 범위

**In Progress — 구현·통제 검증 완료, live 전체 경로 완주 미통과.**
Browser-local 작업 트리와 버전 `0.1.98`의 unpacked build를 대상으로 한다.
S15 / PAH-9의 미통과 live 입력 경로, S17~S20, Platform·Enterprise·배포 완료를 뜻하지 않는다.
구조화된 실행 요약과 source/artifact SHA-256은
[s16-script-tool-loop-validation-2026-10-08.json](s16-script-tool-loop-validation-2026-10-08.json)에 기록한다.

## 구현

- UI 읽기와 script 도구는 `act-read-tool-registry.ts`의 실제 executor 등록으로 schema,
  capability와 dispatch를 구성한다. 등록에 version/result schema/mode/phase/consent/binding/budget을
  포함하고 executor 없는 도구는 offered schema에서 제외한다. 입력 proposal의 승인·실행 계약은 유지한다.
- `content/page-resources.ts`가 실제 document의 설명, inline/external script metadata를 수집한다.
  URL과 원문은 inventory에 포함하지 않는다. resource ID와 document/inventory revision으로 결속한다.
- `list_page_resources`, `search_page_resources`, `read_page_resource`를 실제 Provider function으로
  제공한다. 목록/검색 pagination, 검색 hit의 byte range, bounded chunk와 opaque continuation을 지원한다.
  검색은 resource마다 첫 literal match를 반환하며 coverage scope를 명시한다.
- 별도 source 동의 카드가 사용자 응답을 기다린다. 승인된 ID만 읽고 거부는 DENIED 결과로 모델에
  반환한다. 이는 입력값 승인이나 mutation 승인으로 전환되지 않는다. 동의와 source cache는 메모리에서만
  유지하고 Stop/navigation/restart 이후 재사용하지 않는다.
- external source는 같은 origin의 알려진 script만 fetch한다. credentials=omit, redirect=error,
  cache=no-store, 10초 timeout을 적용한다. query/hash/URL credential과 cross-origin은 미지원이다.
  static text를 읽으며 함수 실행·임의 endpoint 호출을 제공하지 않는다.
- 본문을 worker cache/provider egress 전에 full-line 마스킹한다. 검색/읽기 byte offset은
  `masked_utf8` 공간이며 chunk의 마지막 부분을 전체 source 읽기로 표시하지 않는다.
- 최초 Act payload에 metadata inventory와 실제 도구 schema를 제공한다. 각 결과를 원래
  tool_call_id의 tool message로 반환한 뒤 같은 conversation에서 다음 Provider 호출을 수행한다.
- source-only 요청은 모델이 SOURCE_READ_REQUIRED로 분류한다. 이 세션에는 mutation tool을
  제공하지 않고 hallucinated proposal도 POLICY_DENIED로 차단한다. 일반 입력 요청은 기존 Act 경로다.
- round budget은 12, read budget은 24다. 과도한 batch는 dispatch 전에 차단한다.
  inventory는 script 256개, inline 수집/worker source cache는 4 MiB, 개별 source는 1 MiB,
  chunk는 최대 16 KiB, 검색 page는 최대 8개다. 초과와 부분 coverage를 성공 전체 읽기로 바꾸지 않는다.
- 기존 base64url ID 생성기는 leading `-`/`_`도 생성하지만 Harness validator가 이를 거부했다.
  predicate를 생성 형식과 일치시켰으며 leading 두 문자와 URL 거부 회귀를 검증했다.
- nullable 선택 인자는 schema에 명시하고 omitted와 같은 의미로 처리한다. 잘못된 인자는 실패 결과와
  expected_parameters로 모델에 반환한다. 첫 읽기의 inventory revision과 이후 body revision/cursor를 구분한다.

## 실행 검증

- typecheck, ESLint, Prettier, 버전 보존 build, package validation, module boundaries,
  method instrumentation/trace coverage, git diff --check 통과.
- unit/fixture/e2e: **133 files / 633 tests PASS**.
- 실제 Chrome 통제 suite: **6/6 PASS**. 승인, 거부, Stop, source 변경, navigation, worker restart를 검증한다.
  승인 경로는 실제 목록 pagination→검색→부분 읽기→다음 chunk→최종 응답을 확인한다.
  동의 전 본문·취소 후 late source 결과·mutation이 없고 실제 진단 ZIP의 hash/CRC와 비밀값·소스 원문 비노출을 검사한다.
  검색 excerpt와 resource 처리 callback 배열의 trace 마스킹을 보완했고 실제 ZIP 검사와 회귀 테스트를 통과했다.
- S15 입력 회귀 Chrome: search/notes/clarification/long-value/multiple/deny **6/6 PASS**.
  S15 전체 live 완료를 대체하지 않는다.
- supplementary source-size 검사는 실패했다. 저장소의 기존 초과 파일 외에 신규 smoke/test 파일도
  200줄을 초과한다. 신규 production 모듈은 각각 200줄 미만이며 이 결과를 전체 크기 검사 PASS로 표시하지 않는다.

## 재현 명령

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/eslint extension/src extension/tests --max-warnings=0
node_modules/.bin/vitest run extension/tests/unit extension/tests/fixture extension/tests/e2e
node_modules/.bin/tsc -p tsconfig.build.json
node scripts/build-extension.mjs
node scripts/validate-package.mjs
node scripts/check-module-boundaries.mjs
node scripts/test-method-trace-instrumentation.mjs
node scripts/check-method-trace-coverage.mjs
CHROME_FOR_TESTING_BIN=/path/to/chrome S16_REPORT=/tmp/s16.json npm run test:chrome-s16
CHROME_FOR_TESTING_BIN=/path/to/chrome S16_LIVE_MODEL=cohere/north-mini-code:free S16_REPORT=/tmp/s16-live.json npm run test:chrome-s16
CHROME_FOR_TESTING_BIN=/path/to/chrome npm run test:chrome-s15
```

live proxy는 환경 변수 OPENROUTER_API_KEY를 사용한다. 모델에 보내는 product payload를 전달하며
강제 tool choice나 fixture 답변을 주입하지 않는다. raw synthetic report는 `/tmp`에만 저장하고
repo에는 원문·API key·개별 resource/cursor ID 없는 요약을 기록한다.

## 남은 검증과 한계

최종 구현의 live 전체 경로 완료 조건은 미통과다. 마지막 live 실행은 source-only prompt 적용 후,
최종 diagnostics 마스킹 보완 전에 수행했으며 classifier 호출에서
OpenRouter/cohere/north-mini-code:free가 **HTTP 429**를 반환하여 source 탐색을 시작하지 못했다.
다른 Provider 설정은 제공되지 않았다. quota가 복구되거나 사용 가능한 Provider에서 live 검증을 재실행해야 한다.

이전 0.1.98 탐색적 실행에서는 목록·검색·읽기 선택과 call 결과 반환을 확인했다.
최초 inventory가 충분한 작은 fixture에서는 모델이 목록 호출을 생략하고 검색→읽기→정확한 답변까지
진행했다. 목록 호출을 포함한 다른 실행에서는 인자 오류가 있었고, 28개 resource fixture에서는 세
도구의 성공 결과를 받았지만 모델이 무관한 자료를 계속 읽어 12-round budget으로 INCOMPLETE 종료했다.
이 결과들을 최신 source-only system prompt의 완주 PASS로 사용하지 않는다.

source-only prompt를 일반 Act 입력 지침에서 분리하고 검색 continuation 우선 사용, hit/range 선택,
같은 source/range 반복 금지, 필요한 근거 확보 후 답변 종료를 도구 사용 계약으로 명시했다.
이는 함수명·페이지명으로 실행을 고르는 제품 규칙이나 강제 Provider tool choice가 아니다.
최신 구현의 통제 Chrome와 자동 검증은 통과했으며, 모델 선택·완주 검증은 별도로 남긴다.
실제 운영 사이트, Windows/clean-profile release, 임의 Provider의 호환성은 검증하지 않았다.

## 구현 카드 판정

| 카드 | 현재 판정 |
| --- | --- |
| S16-C1~C5 | Implemented — registry, 실제 수집/읽기, 동의, 결과 반환·취소·budget 연결 |
| S16-C6 | Partial — unit/Chrome/회귀 PASS, 최종 live 전체 경로 완주 미통과 |

S17은 Planned다. 이번 요청으로 S17 구현을 시작하거나 S15 / PAH-9를 완료 처리하지 않았다.
