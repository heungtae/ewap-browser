# S19 Component 도구 구현·검증 — 2026-10-10

## 판정

**Completed (Browser-local).** C1~C6의 지원 채널과 승인·복구 경계를 검증했다.
펼침·페이지 이동의 두 실패는 테스트의 조기 종료 조건과 fixture의 미지원 완료 조건이
원인이었다. 이를 수정한 뒤 통제 Chrome 전체 21/21, 최신 승인 후 재개 2/2,
OpenAI live 승인 후 재개 2/2가 통과했다. 자동 paging/expansion 채널의 지원 범위를
늘리거나 미확인 EOF를 전체 완료로 바꾸지 않았다.

기준 HEAD는 `35fbcee95b9b83809c231a7a4d9432d820dee119`이며 그 위의 작업 트리를
검증했다. 확장 버전은 `0.1.98`을 유지했다. Linux, Node 20.19.6,
pnpm 9.15.4, Playwright chromium-1217의 Chrome for Testing을 사용했다.
Platform·Enterprise 활성화·운영 사이트·릴리스·S20 종합 검증은 포함하지 않는다.

## 구현과 카드 대응

| 카드 | 실제 경로와 근거                                                                                                                | 상태                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| C1   | content inventory에 opaque component ID/revision 추가. 일반 source inventory와 분리하고 실제 Provider에 list 결과 반환          | 통과                            |
| C2   | `describe_component` schema·executor·content 관찰 연결. 종류의 근거, visible/mounted/total count, 채널 availability와 제한 반환 | 통과                            |
| C3   | `read_component_data` closed 인자·바인딩·continuation, DOM reader와 기존 collection registry 연결                               | 지원 채널 통과                  |
| C4   | Act screenshot/zoom 실제 executor·정책 확인, 별도 이미지 전송 동의 후 실제 typed 이미지 전달                                    | 통과, native 권한 prompt는 별도 |
| C5   | bounded scroll 동의·복구, 펼침/페이지 이동의 계획·동작 승인 후 새 읽기와 목표 판단                                              | 통과                            |
| C6   | table/grid/list/tree/chart/SVG/canvas/미분류의 독립 fixture와 live 모델 도구 선택                                               | 지원 채널 통과                  |

`visible_rows`, `subtree`, `description`, 명시적인 DOM 연결의 `alt_table`,
실제 reviewed adapter가 있을 때의 `reviewed_data`, 실제 virtual collection이 있을 때의
`bounded_scroll`, 허용된 `visual`을 제공한다. 어댑터 부재·pagination/expansion의
자동 continuation 부재는 `UNSUPPORTED`다. 종류만으로 수집 전략을 선택하지 않는다.

chart의 보조 표는 `aria-details`/`aria-describedby` 연결만 따른다.
`EXPLICIT_DOM_ASSOCIATION_NOT_VALUE_CORROBORATION`으로 수치 일치 확인을 주장하지 않는다.
접힌 tree의 숨은 자식, canvas 픽셀에서 실제 underlying 수치를 만들어 반환하지 않는다.
현재 window가 전체 수집인 것처럼 보이지 않게 supplied/collected count와 EOF를 구분한다.

component read 요청은 실제 읽기 도구를 제공하는 Act loop로 분류하며 일반 action 계획은
제공하지 않는다. 데이터·이미지 결과는 같은 call ID로 반환하고, 이미지 user message는
해당 turn의 모든 tool 결과 뒤에 추가한다. 시각 결과로 실행 좌표/ref를 생성하지 않는다.

## 실행 결과

- TypeScript, ESLint/Prettier, 버전 보존 빌드·package 검증을 실행했다.
- Unit **149 files / 699 tests**, fixture **1**, E2E **1** 통과.
- module boundary 303 TypeScript 파일과 method-trace 41개 문서화 모듈 / 202 runtime 모듈의 1736개 method·callback 검증이 통과했다.
- source-size 전체 검사는 기존 199줄 초과 파일 때문에 실패한다. HEAD 기준 86개이며
  새 production/test/Chrome 도구 모듈은 각각 199줄 이하로 유지한다.
- [통제 Chrome 전체 21/21](s19/s19-21-final.json): 목록→descriptor→선택 채널→실제
  결과→후속 Provider turn, 표 8개 행의 continuation, virtual grid 40개 수집과 scrollTop 0 복구,
  거부·Stop·문서 revision 변경·vision 거부·민감 데이터 capture 차단·미지원 채널을 확인했다.
- [OpenAI `gpt-6-luna` live 10/10](s19/s19-live-openai.json): 실제 모델이 table/list/tree/chart/SVG/
  canvas/미분류/보조 표/scroll/vision에서 도구를 선택했다. 46회 요청의 upstream HTTP 200,
  실제 tool call/result continuation, 이미지 전달과 진단 ZIP 검사를 통과했다.
- [후속 live 3/3](s19/s19-live-final-revision.json): table/보조 표/vision 15회 요청을 추가 확인했다.
- [최신 승인 후 재개 통제 2/2](s19/s19-actions-current.json): 계획 승인·동작 승인·typed VERIFIED,
  바뀐 tree 자식과 다음 페이지 값의 실제 component read, 해당 요청의 최종 판단 UI를 확인했다.
- [승인 후 재개 OpenAI live 2/2](s19/s19-actions-live-current.json): `gpt-6-luna`의 실제
  plan/click/read/goal 선택과 같은 call ID 결과를 검증했다. 16회 upstream 요청이 모두 HTTP 200이었다. tree는 `incomplete`, paging은
  `completed`로 판단했으며 UI도 각 판단을 그대로 반영했다. partial을 전체 완료로 승격하지 않았다.
- S16 Chrome 6/6, [S17 8/8](s19/s19-s17-regression.json),
  [S18 6/6](s19/s19-s18-regression.json)의 통제 회귀가 통과했다.

진단 ZIP의 entry CRC/SHA 검사와 숨은 자식·민감 fixture 값 비노출을 검사했다.
Provider 요청에서도 민감값이 포함되면 fixture 자체가 실패한다. 보고서는 원문·이미지·API key를
보존하지 않고 schema 이름, call ID, status, coverage, descriptor와 HTTP 결과만 기록한다.

## 실패 이력과 해결

OpenRouter `nvidia/nemotron-3.5-lightning:free`는 HTTP 200 네 번 뒤 60초 upstream timeout이
발생했다. 해당 실행은 완료가 아니다. `docs/test.md`의 가용성 실패 대체 규칙에 따라
OpenAI `gpt-6-luna`로 검증했다. proxy는 timeout/오류를 명시적인 실패 응답으로 반환한다.

[초기 두 실패](s19/s19-actions-2.json)는 계획 승인 직후 생기는 일시적인 idle을
최종 완료로 판단하고 Chrome을 조기에 닫은 테스트 오류였다. 이전에 기록한
`CONTACTING_PROVIDER`/설정 조회/transport 대기는 종료 시점의 위치였으며 제품 재개
결함의 근거가 아니었다. 완료 판단을 해당 요청의 `report_goal_status`와 새 UI feedback
개수로 바꿨다. 이전 요청의 완료 문구도 현재 요청의 완료 근거로 사용하지 않는다.

[대기 수정 직후의 재현](s19/s19-action-wait.json)에서 tree는 통과했고 pager는
`UNSUPPORTED_COMPLETION`으로 클릭 전 차단됐다. 기존 fixture의 `aria-pressed`는 현재
검증기가 지원하는 semantic 완료 상태가 아니다. fixture를 실제 선택 상태 전이가 있는
`role=tab`/`aria-selected` 페이지 이동 UI로 수정했다. 승인 없이 클릭하거나 검증기 제한을
완화하지 않았으며, 다음 페이지 값이 실제로 읽혔는지도 추가 확인한다.

[첫 live 재시도](s19/s19-actions-live.json)는 단일 동작의 직접 승인 경로를 선택해
테스트가 기대한 계획 제출이 없었다. 사용자 prompt에 계획 검토 요구를 명시했다.
[다음 live 재시도](s19/s19-actions-live-goal.json)는 실제 동작·읽기는 검증됐으나
partial 목표 판단 또는 최종 UI의 반영 대기를 완료 실패로 기록했다.
최종 검사는 completed/incomplete를 구별하고 새 판단의 정확한 표시를 기다린다.
`UNKNOWN`, FAILED, 미검증 동작, 새 데이터가 없는 읽기, 이전 요청의 feedback은 통과시키지 않는다.
종료용 `report_goal_status`는 추가 Provider turn을 요구하지 않고 실제 terminal UI로 검증한다.

```bash
CHROME_FOR_TESTING_BIN=/home/heungtae/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
S19_CASES=tree-expand-action,paging-action S19_REPORT=/tmp/s19-actions.json pnpm test:chrome-s19
```

[실제 스크롤 동의 카드](s19/s19-scroll-approval.png)와
[이미지 동의 카드](s19/s19-vision-approval.png)를 확인했다.

Chrome 자동화에서는 격리 profile의 `<all_urls>` 권한을 seed한 후 재시작한다.
실제 Side Panel의 이미지 동의는 검증했으며 제품은 사용자 클릭에서 Chrome optional permission을
요청한다. native Chrome 권한 prompt의 수동 승인까지 검증했다는 의미는 아니다.
권한 거부·예외가 동의를 허용으로 바꾸지 않는 경계는 unit으로 확인했다.
EOF가 확인되지 않은 description/tree/canvas는 partial이며, 선택한 모델/fixture 결과를
임의 사이트·다른 모델·자동 paging/expansion 지원으로 일반화하지 않는다.
