# S16 live Provider 검증 — Nemotron, 2026-10-09

수정 전 실행 기록이다. 최신 상태는 [실패 수정·재검증](s16-live-tool-loop-fix-2026-10-09.md)을 따른다.

**FAIL — S16 In Progress 유지.** 기존 0.1.98 빌드로 실제 Chrome와 OpenRouter의
`nvidia/nemotron-3.5-lightning:free`를 연결했다. Browser-local 통제 HTTPS fixture의
실제 모델 선택 검증이며 운영 사이트·배포·Platform 검증은 아니다.
[구조화된 결과와 파일 해시](s16-live-nemotron-validation-2026-10-09.json)를 함께 기록한다.

## 실행과 결과

```bash
CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
S16_LIVE_MODEL=nvidia/nemotron-3.5-lightning:free \
S16_REPORT=/tmp/s16-live-nemotron-2026-10-09.json npm run test:chrome-s16
```

- 인증은 실행 환경의 `OPENROUTER_API_KEY`를 사용했다. 키 원문을 출력하거나 저장하지 않았다.
- Chrome for Testing 147.0.7727.15, 종료 코드 1. 10월 8일 증거의 소스 20개,
  검증 파일 4개, 빌드 산출물 4개 해시가 모두 일치하여 재빌드 없이 실행했다.
- classifier를 포함한 Provider 요청 12개가 모두 HTTP 200이었다. 모델은
  `SOURCE_READ_REQUIRED`를 선택했다. HTTP 429였던 이전 시도와 실패 원인이 다르다.
- 모델은 목록 도구 4회, 검색 도구 5회, `get_page_text` 1회를 호출했다.
  목록 성공 결과 2개와 검색 성공 결과 3개가 원래 call ID로 같은 대화에 반환됐다.
- 첫 목록·검색 호출에서 `page_size`를 정수가 아닌 문자열로 전달하여 각각
  `INVALID_PAGE_SIZE`를 받았다. cursor 오류 2회도 `INVALID_CURSOR`로 반환됐다.
  잘못된 인자를 자동 보정하거나 강제 tool choice를 넣지 않았다.
- 실제 소스 동의 UI를 확인하고 테스트 사용자가 허용했다. 동의 전 소스 본문
  비전달 검사는 통과했다.
- 성공한 검색 3회는 각각 28개 resource 중 4개만 처리했다. 모두 `hits=[]`,
  `coverage.complete=false`, `truncated=true`, `next_cursor` 존재 상태였다.
- 모델은 `read_page_resource`를 한 번도 호출하지 않았고, 마지막 답변에서 전체
  검색을 마쳤으며 대상 함수가 없다고 주장했다. fixture에는 대상 함수가 실제로 존재한다.
  따라서 마지막 답변은 정확하지 않으며 전체 탐색·읽기 완료를 입증하지 못한다.
- 테스트는 `live model did not choose read_page_resource` assertion에서 실패했다.
  이후 단계인 진단 ZIP 검사는 실행되지 않았으므로 이번 실행의 마스킹 PASS로 기록하지 않는다.

## 다음 확인 항목

모델의 인자 타입 준수, 도구별 cursor 사용, 빈 부분 검색의 continuation,
coverage에 근거한 최종 답변을 확인해야 한다. 이번 실행은 제품 코드를 변경하지 않았다.
기존 자동 테스트 633개와 통제 Chrome 6개 PASS는
[10월 8일 증거](s16-script-tool-loop-2026-10-08.md)의 별도 검증 범위다.
타입 검사와 633개 자동 테스트는 같은 작업 트리에서 10월 9일 진행 확인 중 재실행해 통과했다.

raw 합성 report는 `/tmp`에만 보관한다. 저장소 요약에는 키·원문 source·개별 resource/cursor/call ID를
포함하지 않는다. S16 완료나 S17 착수를 의미하지 않는다.
