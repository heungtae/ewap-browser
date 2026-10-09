# S16 live 실패 수정과 재검증 — 2026-10-09

**PASS — Browser-local S16 Completed.** `nvidia/nemotron-3.5-lightning:free`와 실제
Chrome를 연결해 목록→검색→부분 읽기→동일 대화 결과 반환→답변→진단 ZIP 검사를 통과했다.
기준은 [수정 전 live 실패](s16-live-nemotron-2026-10-09.md)와
[10월 8일 구현](s16-script-tool-loop-2026-10-08.md)이다.
[구조화된 결과와 SHA-256](s16-live-tool-loop-fix-validation-2026-10-09.json)에 최종 revision을 기록한다.

## 원인과 수정

| 확인한 원인 | 수정과 검증 |
| --- | --- |
| nullable union의 선택 인자에 숫자 문자열·`None` 문자열을 보냄 | Provider schema는 생략 가능한 단일 primitive 타입으로 제공한다. 기존 JSON `null`은 parser에서 호환 처리한다. 문자열 숫자·가짜 cursor는 오류이며 자동 보정하지 않는다. 최종 live의 page size, offset, max bytes는 정수였다. |
| 도구·query별 cursor를 모델이 혼동 | 목록·검색·chunk 결과에 재사용 가능한 `continuation.tool/arguments`를 제공한다. 기존 request/document/query/revision 검증은 유지한다. |
| 빈 부분 검색을 전체 검색으로 해석하고 함수가 없다고 답함 | 검색 기본 page size를 기존 한도 안의 8로 올리고 query별 distinct resource 진행 수와 미지원 수를 제공한다. 중복 페이지를 두 번 세지 않고 source revision 변경 시 폐기한다. |
| 부분 검색만으로 답변을 끝내도 `VERIFIED` 처리됨 | source-only loop에서 hit 없는 검색의 continuation이 남아 있으면 답변을 그대로 게시하지 않고 한 번 재검토시킨다. 다시 근거 없이 끝내면 `UNKNOWN / SOURCE_SEARCH_INCOMPLETE`로 종료한다. |
| 중간 재검증에서 답변에 인용한 소스가 trace의 `delta/message`에 남음 | provider delta·반환 message·source query를 마스킹한다. 통제 fixture 답변에도 코드를 인용하도록 하여 동일 유출 경로를 검증한다. |

system prompt와 도구 설명에 JSON 타입, 최초 optional field 생략, query별 cursor,
부분 검색의 의미, hit에 근거한 bounded read를 명시했다. 모델이 query·resource·읽기를 선택한다.
문장·함수명·페이지명 정규식으로 제품의 답변이나 실행을 고르지 않는다.
함수 실행·endpoint 호출·mutation 권한이나 강제 Provider tool choice를 추가하지 않았다.

## 최종 live 실행

```bash
CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
S16_LIVE_MODEL=nvidia/nemotron-3.5-lightning:free \
S16_REPORT=/tmp/s16-final-live-nemotron-2026-10-09.json npm run test:chrome-s16
```

- OpenRouter / 지정 모델, Chrome for Testing 147.0.7727.15, extension 0.1.98, 종료 코드 0.
- 실제 요청 10개 모두 HTTP 200. 목록 3회, 검색 4회, 읽기 1회, 최종 답변을 확인했다.
  첫 목록의 잘못된 cursor는 `INVALID_CURSOR`로 거부되고 같은 대화에서 모델이 교정했다.
  모든 호출이 처음부터 유효했다는 뜻은 아니다.
- 목록은 20개→8개로 28개 resource metadata를 모두 확인했다. 이 수에는 page description도 포함된다.
- 검색은 8개→8개→8개→4개를 처리해 마지막 페이지의 hit를 발견했다. 미지원 external script 1개로
  source 검색의 `progress.complete`는 false이며 이를 전체 source 접근 성공으로 바꾸지 않았다.
- 실제 소스 동의 UI를 확인하고 테스트 사용자가 허용했다. 동의 전 본문 비전달과
  모든 Provider 요청의 합성 비밀값 비노출 검사를 통과했다.
- 모델이 hit의 ID/revision, 정수 offset 9와 max bytes 256으로 읽기를 선택했다.
  요청한 함수와 계산식을 읽고 `amount`의 3배 계산을 설명했다.
  전달한 256바이트를 전체 10,515바이트 source 검토로 표시하지 않았다.
- 목록·검색·읽기 성공 결과가 원래 call ID로 다음 Provider turn에 반환됐다.
  읽은 계산식과 답변의 계산 설명을 별도 assertion으로 확인했다.
- 실제 진단 ZIP의 구조/hash/CRC, 비밀값·소스 원문 비노출 PASS.
  fixture 입력값이 변경되지 않아 source-only mutation 비발생도 확인했다.

## 자동·통제 검증

- unit/fixture/e2e: **137 files / 645 tests PASS**.
- typecheck, ESLint/Prettier, 버전 보존 build, package validation, module boundaries,
  method instrumentation/trace coverage, `git diff --check` PASS.
- S16 Chrome: 승인·거부·Stop·source 변경·navigation·worker restart **6/6 PASS**.
  코드 인용 답변을 포함한 진단 ZIP 마스킹을 검사했다.
- S15 입력 Chrome 회귀: search·notes·clarification·long-value·multiple·deny **6/6 PASS**.
- 보조 source-size 검사: **FAIL**, 저장소 내 초과 파일 85개. 이번 수정의 신규 production
  모듈·신규 unit 파일은 모두 200줄 미만이다. 전체 파일 크기 검사를 PASS로 표시하지 않는다.

build는 버전 증가 없이 `tsc -p tsconfig.build.json && node scripts/build-extension.mjs &&
node scripts/validate-package.mjs`로 수행했다.

## 중간 실행과 범위

첫 수정 빌드의 live 시도는 classifier HTTP 200 이후 파싱된 모델 응답을 확보하지 못해
source 동의 단계에 도달하지 못했다. 다음 시도는 목록·검색·읽기와 계산 설명까지 통과했지만
진단 ZIP에서 답변에 인용한 코드가 발견됐다. 이 실행들을 최종 PASS에 합산하지 않는다.
최종 primitive schema·echo 마스킹을 포함한 빌드로 통제·live 검증을 다시 실행했다.

S16-C1~C6의 Browser-local 연결 검증을 완료한 범위다. 임의 Provider·운영 사이트,
Windows/clean-profile release·Platform·Enterprise·S17~S20의 완료를 의미하지 않는다.
자연어 답변의 모든 의미와 모델의 모든 선택을 검증한 것도 아니다.
S15 / PAH-9의 별도 live 판정은 유지하며 S17 구현은 시작하지 않았다.

기존 dirty worktree의 관련 파일에만 변경을 추가했고 commit/push/release는 수행하지 않았다.
raw 합성 report는 `/tmp`에만 보관한다. 저장소 evidence에는 API key·원문 source·
개별 resource/cursor/call ID를 넣지 않는다.
