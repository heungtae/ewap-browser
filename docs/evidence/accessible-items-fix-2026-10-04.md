# Accessible items 결함 수정 검증 — 2026-10-04

## 범위와 결과

Browser 0.1.89에서 앞서 안내한 예제 **17개가 모두 기대한 결과를 냈다**.
실제 Chrome Side Panel로 제안·작업 승인·권한 결정·값 입력을 진행했고,
페이지의 실제 DOM 상태와 Panel 종료 상태를 assertion으로 확인했다.
비활성 버튼은 차단되어야 PASS이며, 권한 거부와 민감정보 비노출도 포함한다.
초기 실패 기록은 [별도 문서](accessible-items-chrome-2026-10-04.md)에 유지한다.

검증 환경은 Chrome for Testing 147.0.7727.15, Node 20.19.6, Linux X11/Xvfb다.
HTTP는 실제 `http://127.0.0.1:3002/#controls` 서버를 사용했다. HTTP host 권한을
이미 승인한 임시 테스트 profile을 복제했고 Service Worker/Code Cache를 제거했다.
원본 테스트 profile이나 사용자 Chrome profile에서 실행하지 않았다.
HTTPS는 같은 예제 HTML을 local HTTPS 서버로 제공하고 새 임시 profile에서 실행했다.
두 실행 모두 runtime manifest 0.1.89를 확인하고 17/17 assertion을 통과했다.

Provider는 local HTTPS OpenAI-compatible `chat_completions` fixture다.
제공된 model ref와 tool enum으로 요청을 만들며, 외부 Provider 호출이나
사용자 ZIP에 기록된 live Responses 모델의 응답 품질 검증은 포함하지 않는다.
선행 상태를 준비하는 직접 페이지 조작은 확장 실행 성공으로 계산하지 않는다.

| 케이스 | PASS 조건과 관측 |
| --- | --- |
| Ask 읽기 | 컨트롤과 비활성 상태가 Provider projection에 전달됨 |
| Search query | `browser test` 입력, Panel Send 복귀 |
| Notes | `테스트 메모` 입력, Panel Send 복귀 |
| Report scope | tool enum `Detailed`로 선택, 실제 값 `detailed` |
| Include detailed results | checked=true |
| 비활성 Preview | 제안/실행 차단, 결과와 disabled 상태 유지 |
| 준비 후 Preview | `Preview generated for Detailed.` 표시 |
| Generate local preview Workflow | scope 선택 → checkbox → Preview의 실제 결과 확인 |
| 권한 거부 | 값 변경 없음, 자동으로 Panel Send 복귀 |
| Activity | aria-selected=true |
| 메뉴 열기 | aria-expanded=true, 추가 메뉴 선택 강제 없이 종료 |
| Mark reviewed | `Local item marked reviewed.` 표시 |
| Dialog 열기 | dialog.open=true |
| Dialog 닫기 | dialog.open=false |
| Details 펼치기 | summary 위치로 스크롤 후 details.open=true |
| Disabled action | 실행 차단, 페이지 상태 유지 |
| Password 질문 | password/OTP node와 fixture secret 값이 Provider 입력에 없음 |

## 수정 내용과 경계

- CDP는 scroll 이후 `Page.getLayoutMetrics`의 CSS offset/크기를 읽는다.
  document 좌표로 hit test하고 viewport 좌표로 입력하며 target/token을 재확인한다.
- native label에서 중첩된 form control의 텍스트를 제외해 `Report scope`를 정확히
  매칭한다. 이름의 fuzzy match나 Workflow 선언 우회는 추가하지 않았다.
- loopback의 deny는 현재 run에만 적용하고 종료/철회 시 제거한다.
  IP와 localhost에 영구 허용을 저장하지 않는다.
- native summary의 button/expanded 상태를 투영하며 닫힌 details의 첫 summary는
  보이는 컨트롤로 판단한다. 나머지 접힌 내용의 hidden 경계는 유지한다.
- tab의 selected 상태와 disclosure의 양방향 expanded 상태를 완료 조건으로 사용한다.
  추가 메뉴 선택은 승인된 navigation session에만 강제한다.
- 일반 R1 local UI click은 명시적 ARIA status 관계 또는 native dialog 관계가 있을
  때만 별도 Browser observer로 완료를 검증한다. 관계 없는 임의 click은 계속 차단한다.
  20초 TTL, 최대 32개, run/document/URL/연결된 node와 관계의 유일성 검사를 적용한다.
  상태 원문은 content script 밖으로 전달하지 않고 boolean 검증 결과만 전송한다.
  이 결과는 local UI 변화이며 business 성공을 증명하지 않는다.
- 예제에는 표준 `aria-controls`/`aria-haspopup`와 native dialog form을 추가했다.
  특정 페이지 이름이나 selector를 제품 코드에 등록하지 않았다.
- Side Panel 테스트 helper는 Settings 문서 로딩을 기다린다. 새 테스트는 서비스워커
  실행 context와 manifest를 확인하며, 17개 assertion이 모두 성공해야 exit 0이다.
- S9 테스트는 candidate ZIP을 먼저 생성해 패키징 선행 조건을 자체 충족한다.

공유 `ewap/v1` schema, signed Profile 완료 조건, 저장된 permission 구조는 변경하지
않았다. Workspace/Platform 구현은 수정하지 않았고 Platform 테스트는 실행하지 않았다.
기존 잘못된 label 전체 문자열을 사용하는 Profile/Workflow는 올바른 이름으로 target을
갱신해야 한다. 오래된 선언은 느슨한 매칭으로 실행하지 않고 실패 시 차단한다.

## 검증 명령

- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run validate:package`
- `npm run test:unit`: 109 files / 465 tests PASS
- `npm run test:fixture`, `npm run test:e2e`: 각각 1 test PASS; 총 467 tests
- `npm run check:module-boundaries`: 239 TypeScript files PASS
- `npm run test:release`, `npm run package:local`
- Chrome extension/preview, S1–S8, Community, S9 upgrade/rollback,
  S10 Page API, S11 MCP, S14 workflow, collection, analysis data,
  diagnostics ZIP, Page API discovery: 19개 기존 Chrome 명령 모두 PASS
- `npm run test:chrome-accessible-items`: HTTP headed 17/17, HTTPS fresh-profile 17/17

S9 최초 실행은 candidate ZIP이 없어 실패했다. ZIP 생성 후 재실행해
`0.1.88 → 0.1.89 → 0.1.88`의 upgrade/rollback, 같은 extension ID,
permission mode/저장된 거부 보존과 새 session을 확인했다.

HTTP 최종 결과: `/tmp/accessible-items-0.1.89-http.json`.
HTTPS 최종 결과: `/tmp/accessible-items-0.1.89-https.json`.
회귀 명령별 로그: `/tmp/accessible-regression-test-*.log`.
테스트 입력/상태는 합성 fixture 값이며 model ref, credentials, 실제 사용자 입력은
이 증거 문서나 commit에 저장하지 않았다.

예제 HTML SHA-256: `3a713ec76230c3c0cb0d54c303dbf5f8c58215c5c859b5c392fe0a69e2a30b99`.
ZIP: `dist/contextpilot-0.1.89.zip`.
ZIP SHA-256: `bf8e78a9086f2487e622624e1dea6dba1e725348659a29473db3a352ede6ebb5`.
